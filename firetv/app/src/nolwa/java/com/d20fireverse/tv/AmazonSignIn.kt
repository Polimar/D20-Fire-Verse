package com.d20fireverse.tv

import android.app.Activity
import android.os.Handler
import android.os.Looper

/**
 * Built without the Login with Amazon SDK (see scripts/fetch-lwa-sdk.sh). The page keeps the
 * Amazon button off and offers the test account.
 */
class AmazonSignIn(private val activity: Activity, private val deliver: (AmazonResult) -> Unit) {

    private val main = Handler(Looper.getMainLooper())

    val available: Boolean = false

    fun signIn(@Suppress("UNUSED_PARAMETER") interactive: Boolean) {
        main.post { if (!activity.isFinishing) deliver(AmazonResult.Failed(AmazonResult.NOT_CONFIGURED)) }
    }

    fun signOut() = Unit

    fun onResume() = Unit
}
