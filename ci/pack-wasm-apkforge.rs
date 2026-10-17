// Apache-2.0 extensions to Google Pack. DEX is inserted BEFORE APK v2/v3 signing.
// An AAPT2-compiled resource APK can also be signed without recompilation in Pack.
use base64::{engine::general_purpose, Engine as _};
use pack_api::{compile_apk, FileResource, Keys, Package};
use pack_asset_compiler::{
    resource_internal_types::Resource,
    resource_table::construct_resource_table,
    strings_xml_parser::parse_strings_xml,
};
use serde_wasm_bindgen::{from_value, to_value};
use std::{
    collections::{BTreeMap, HashSet},
    io::{Cursor, Read},
};
use wasm_bindgen::prelude::*;
use zip::ZipArchive;
use crate::input_types::PackWasmInput;

fn decode(s: &str) -> Result<Vec<u8>, String> {
    general_purpose::STANDARD.decode(s.as_bytes()).map_err(|e| format!("Base64: {e}"))
}
fn to_package(input: &PackWasmInput) -> Result<Package, String> {
    let android_manifest = decode(&input.manifest_b64)?;
    let resources = input.resources.iter().map(|r| {
        Ok(FileResource::new(r.subdirectory.clone(), r.name.clone(), decode(&r.contents_b64)?))
    }).collect::<Result<Vec<_>, String>>()?;
    Ok(Package { android_manifest, resources })
}
fn manifest_package(data: &[u8]) -> Result<String, String> {
    for event in xml::reader::EventReader::new(Cursor::new(data)) {
        match event {
            Ok(xml::reader::XmlEvent::StartElement { name, attributes, .. })
                if name.local_name == "manifest" => {
                return attributes.into_iter()
                    .find(|a| a.name.local_name == "package" && a.name.namespace.is_none())
                    .map(|a| a.value).ok_or("Manifest package missing".into());
            },
            Err(e) => return Err(format!("Invalid XML manifest: {e}")),
            _ => {}
        }
    }
    Err("AndroidManifest.xml has no manifest root".into())
}
#[wasm_bindgen]
pub fn apkforge_resource_ids(data: JsValue) -> Result<JsValue, String> {
    let input: PackWasmInput = from_value(data).map_err(|e| e.to_string())?;
    let pkg = to_package(&input)?;
    let name = manifest_package(&pkg.android_manifest)?;
    let mut resources = Vec::<Resource>::new();
    for file in pkg.resources {
        if file.subdirectory == "values" && file.name == "strings.xml" {
            resources.extend(parse_strings_xml(&mut Cursor::new(file.contents)));
        } else {
            resources.push(Resource::File(file));
        }
    }
    resources.sort_by(|a, b| a.get_subdirectory().cmp(b.get_subdirectory()));
    construct_resource_table(&name, &mut resources).map_err(|e| format!("Resources: {e:?}"))?;
    let mut out = BTreeMap::<String, u32>::new();
    for r in resources {
        let id = r.get_resource_id();
        let basename = r.get_basename().map_err(|e| format!("{e:?}"))?;
        let key = format!("{}/{}", r.get_subdirectory(), basename);
        if out.insert(key.clone(), id).is_some() { return Err(format!("Duplicate resource: {key}")); }
    }
    to_value(&out).map_err(|e| e.to_string())
}
fn sign_linked_apk_with_dex(unsigned_apk: &[u8], dex: &[String], extra: &[(String, String)], keys: &Keys) -> Result<String, String> {
    if dex.is_empty() || dex.len() > 40 { return Err("Invalid DEX count".into()); }
    if unsigned_apk.len() > 100_000_000 { return Err("Resource APK exceeds 100 MB".into()); }
    let mut archive = ZipArchive::new(Cursor::new(unsigned_apk)).map_err(|e| e.to_string())?;
    let mut files = Vec::<pack_zip::File>::new();
    let mut seen = HashSet::<String>::new();
    let mut manifest_ok = false;
    let mut table_ok = false;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        if entry.is_dir() { continue; }
        let path = entry.name().to_string();
        if path.starts_with('/') || path.contains('\\') ||
           path.split('/').any(|s| s.is_empty() || s == "." || s == "..") ||
           !seen.insert(path.clone()) {
            return Err(format!("Unsafe or duplicate APK entry: {path}"));
        }
        if path.ends_with(".dex") || path.starts_with("META-INF/") {
            return Err(format!("Unsigned resource APK contains forbidden entry: {path}"));
        }
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        if path == "AndroidManifest.xml" {
            if bytes.len() < 8 || &bytes[..2] != &[3, 0] {
                return Err("AndroidManifest.xml is not binary Android XML".into());
            }
            manifest_ok = true;
        }
        if path == "resources.arsc" {
            if bytes.len() < 8 || &bytes[..2] != &[2, 0] {
                return Err("Invalid resources.arsc chunk".into());
            }
            table_ok = true;
        }
        files.push(pack_zip::File { path, data: bytes });
    }
    if !manifest_ok || !table_ok {
        return Err("AAPT2 / Pack resource APK lacks AndroidManifest.xml or resources.arsc".into());
    }
    for (idx, encoded) in dex.iter().enumerate() {
        let bytes = decode(encoded)?;
        if bytes.len() < 8 || &bytes[0..4] != b"dex\n" || bytes.len() > 100_000_000 {
            return Err(format!("Invalid DEX #{}", idx + 1));
        }
        let path = if idx == 0 { "classes.dex".into() } else { format!("classes{}.dex", idx + 1) };
        files.push(pack_zip::File { path, data: bytes });
    }
    // Asset and native-library bytes belong INSIDE the ZIP before the APK
    // signing block is calculated; modifying a signed APK would break v2/v3.
    if extra.len() > 500 { return Err("Too many AAR extra files".into()); }
    let mut extra_total = 0usize;
    for (path, contents_b64) in extra {
        if path.starts_with('/') || path.contains('\\') ||
           path.split('/').any(|s| s.is_empty() || s == "." || s == "..") ||
           !(path.starts_with("assets/") || path.starts_with("lib/")) ||
           (path.starts_with("lib/") && !(path.ends_with(".so") &&
             ["armeabi-v7a", "arm64-v8a", "x86", "x86_64"]
                .iter().any(|abi| path.starts_with(&format!("lib/{abi}/"))))) ||
           !seen.insert(path.clone()) {
            return Err(format!("Unsafe/duplicate AAR asset or JNI path: {path}"));
        }
        let data = decode(contents_b64)?;
        extra_total = extra_total.checked_add(data.len()).ok_or("Extra file size overflow")?;
        if extra_total > 100_000_000 { return Err("AAR assets/JNI exceed 100 MB".into()); }
        files.push(pack_zip::File { path: path.clone(), data });
    }
    let mut unsigned = Vec::new();
    pack_zip::zip_apk(&files, Cursor::new(&mut unsigned))
        .map_err(|e| format!("ZIP alignment: {e:?}"))?;
    let signed = pack_sign::sign_apk_buffer(&mut unsigned, keys)
        .map_err(|e| format!("APK v2/v3 signature: {e:?}"))?;
    Ok(general_purpose::STANDARD.encode(signed))
}
#[wasm_bindgen]
pub fn apkforge_sign_with_dex(input: JsValue, dex_payloads: JsValue) -> Result<String, String> {
    let input: PackWasmInput = from_value(input).map_err(|e| e.to_string())?;
    let dex: Vec<String> = from_value(dex_payloads).map_err(|e| e.to_string())?;
    let pkg = to_package(&input)?;
    let keys = Keys::from_combined_pem_string(&input.combined_pem_string)
        .map_err(|e| format!("Signing key: {e:?}"))?;
    let unsigned = compile_apk(&pkg).map_err(|e| format!("Resource compiler: {e:?}"))?;
    sign_linked_apk_with_dex(&unsigned, &dex, &[], &keys)
}
#[wasm_bindgen]
pub fn apkforge_sign_linked_apk(
    aapt2_linked_apk_b64: String,
    dex_payloads: JsValue,
    combined_pem_string: String,
) -> Result<String, String> {
    let unsigned = decode(&aapt2_linked_apk_b64)?;
    let dex: Vec<String> = from_value(dex_payloads).map_err(|e| e.to_string())?;
    let keys = Keys::from_combined_pem_string(&combined_pem_string)
        .map_err(|e| format!("Signing key: {e:?}"))?;
    sign_linked_apk_with_dex(&unsigned, &dex, &keys)
}
/** Inject verified Maven AAR assets/JNI into the resource APK BEFORE v2/v3 signing. */
#[wasm_bindgen]
pub fn apkforge_sign_linked_apk_with_extra(
    aapt2_linked_apk_b64: String,
    dex_payloads: JsValue,
    extra_payloads: JsValue,
    combined_pem_string: String,
) -> Result<String, String> {
    let unsigned = decode(&aapt2_linked_apk_b64)?;
    let dex: Vec<String> = from_value(dex_payloads).map_err(|e| e.to_string())?;
    let extra: Vec<(String, String)> = from_value(extra_payloads).map_err(|e| e.to_string())?;
    let keys = Keys::from_combined_pem_string(&combined_pem_string)
        .map_err(|e| format!("Signing key: {e:?}"))?;
    sign_linked_apk_with_dex(&unsigned, &dex, &extra, &keys)
}
