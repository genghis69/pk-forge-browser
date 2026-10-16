package dev.apkforge.browser.proof;
import android.app.Activity;
import android.os.Bundle;
public class BrowserActivity extends Activity {
 @Override public void onCreate(Bundle state) {
   super.onCreate(state);
   int sdk = android.os.Build.VERSION.SDK_INT;
   if(sdk < 1) throw new IllegalStateException("Android API missing");
 }
}
