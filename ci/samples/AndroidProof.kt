package dev.apkforge.proof
import android.content.Context
class AndroidProof(val context: Context) {
 fun packageName(): String = context.packageName
}
