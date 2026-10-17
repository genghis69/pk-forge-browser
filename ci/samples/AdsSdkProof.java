package dev.apkforge.browser.proof;

import android.app.Activity;
import com.applovin.mediation.ads.MaxRewardedAd;
import com.applovin.sdk.AppLovinSdk;
import com.applovin.sdk.AppLovinMediationProvider;
import com.applovin.sdk.AppLovinSdkInitializationConfiguration;
import com.google.android.gms.ads.identifier.AdvertisingIdClient;

/** CI-only compilation proof against real published Maven SDK classes. */
public final class AdsSdkProof {
    private AdsSdkProof() {}

    public static void verifyActualSignatures(Activity activity) {
        AppLovinSdkInitializationConfiguration config =
                AppLovinSdkInitializationConfiguration.builder("TEST_ONLY")
                        .setMediationProvider(AppLovinMediationProvider.MAX)
                        .build();
        AppLovinSdk.getInstance(activity).initialize(config, sdkConfig -> {});
        MaxRewardedAd ad = MaxRewardedAd.getInstance("TEST_ONLY", activity);
        ad.loadAd();
        ad.showAd(activity);
        Class<?> advertisingIdApi = AdvertisingIdClient.class;
        if (advertisingIdApi == null) throw new AssertionError();
    }
}
