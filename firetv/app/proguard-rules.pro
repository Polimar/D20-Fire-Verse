# The page calls these through window.FireVerseApp.
-keepclassmembers class com.d20fireverse.tv.TableBridge {
    @android.webkit.JavascriptInterface <methods>;
}

# Login with Amazon SDK (present only when libs/login-with-amazon-sdk.jar was fetched).
-keep class com.amazon.identity.** { *; }
-dontwarn com.amazon.**
# The SDK has optional overloads for AndroidX fragments, which this app does not ship.
-dontwarn androidx.**
