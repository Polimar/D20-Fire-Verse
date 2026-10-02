package com.d20fireverse.tv

import android.webkit.JavascriptInterface

/** What the table page may ask of the app, exposed as `window.FireVerseApp`. */
class TableBridge(private val activity: MainActivity) {

    /** Leave the current table and pick another server. */
    @JavascriptInterface
    fun changeTable() {
        activity.runOnUiThread { activity.changeTable() }
    }

    @JavascriptInterface
    fun exit() {
        activity.runOnUiThread { activity.finish() }
    }

    @JavascriptInterface
    fun version(): String = BuildConfig.VERSION_NAME

    /** True when this build carries the LWA SDK and an API key for this package. */
    @JavascriptInterface
    fun amazonAvailable(): Boolean = activity.amazonAvailable

    /** The answer comes back through `window.fireverseNative.amazonToken()` or `amazonError()`. */
    @JavascriptInterface
    fun amazonSignIn(interactive: Boolean) {
        activity.runOnUiThread { activity.amazonSignIn(interactive) }
    }

    @JavascriptInterface
    fun amazonSignOut() {
        activity.runOnUiThread { activity.amazonSignOut() }
    }
}
