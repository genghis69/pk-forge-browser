package dev.apkforge.browser.proof;
import android.app.Activity;
import android.os.Bundle;
public class JavaActivity extends Activity {
 @Override public void onCreate(Bundle state) {
   super.onCreate(state);
   int android = android.os.Build.VERSION.SDK_INT;
   if(android < 1) throw new IllegalStateException("Android API missing");
 }
}
