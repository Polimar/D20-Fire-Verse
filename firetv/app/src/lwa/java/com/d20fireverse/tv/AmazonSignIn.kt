package com.d20fireverse.tv

import android.app.Activity
import android.os.Handler
import android.os.Looper
import com.amazon.identity.auth.device.AuthError
import com.amazon.identity.auth.device.api.Listener
import com.amazon.identity.auth.device.api.authorization.AuthCancellation
import com.amazon.identity.auth.device.api.authorization.AuthorizationManager
import com.amazon.identity.auth.device.api.authorization.AuthorizeListener
import com.amazon.identity.auth.device.api.authorization.AuthorizeRequest
import com.amazon.identity.auth.device.api.authorization.AuthorizeResult
import com.amazon.identity.auth.device.api.authorization.ProfileScope
import com.amazon.identity.auth.device.api.workflow.RequestContext
import java.io.IOException

/**
 * Login with Amazon through the LWA SDK. The SDK only works with an `assets/api_key.txt` issued
 * for this package and signing key, so without it the button stays off on the page.
 */
class AmazonSignIn(private val activity: Activity, private val deliver: (AmazonResult) -> Unit) {

    private val main = Handler(Looper.getMainLooper())

    val available: Boolean = hasApiKey(activity)

    private val requestContext: RequestContext? =
        if (available) RequestContext.create(activity).also { it.registerListener(Interactive()) } else null

    /** Interactive shows Amazon's consent screen; silent only returns a token the player approved before. */
    fun signIn(interactive: Boolean) {
        val context = requestContext
        if (context == null) {
            post(AmazonResult.Failed(AmazonResult.NOT_CONFIGURED))
            return
        }
        if (interactive) {
            AuthorizationManager.authorize(AuthorizeRequest.Builder(context).addScopes(*scopes()).build())
            return
        }
        AuthorizationManager.getToken(activity, scopes(), object : Listener<AuthorizeResult, AuthError> {
            override fun onSuccess(result: AuthorizeResult) = post(tokenOf(result))
            override fun onError(error: AuthError) = post(AmazonResult.Failed(AmazonResult.FAILED))
        })
    }

    /** Log out on the table also forgets the Amazon approval on this TV. */
    fun signOut() {
        if (!available) return
        AuthorizationManager.signOut(activity.applicationContext, object : Listener<Void, AuthError> {
            override fun onSuccess(result: Void?) = Unit
            override fun onError(error: AuthError) = Unit
        })
    }

    fun onResume() {
        requestContext?.onResume()
    }

    private inner class Interactive : AuthorizeListener() {
        override fun onSuccess(result: AuthorizeResult) = post(tokenOf(result))
        override fun onError(error: AuthError) = post(AmazonResult.Failed(AmazonResult.FAILED))
        override fun onCancel(cancellation: AuthCancellation) = post(AmazonResult.Failed(AmazonResult.CANCELLED))
    }

    private fun tokenOf(result: AuthorizeResult): AmazonResult =
        result.accessToken?.takeIf { it.isNotBlank() }?.let { AmazonResult.Token(it) }
            ?: AmazonResult.Failed(AmazonResult.FAILED)

    private fun post(result: AmazonResult) {
        main.post { if (!activity.isFinishing) deliver(result) }
    }

    private companion object {
        fun scopes() = arrayOf(ProfileScope.profile(), ProfileScope.userId())

        fun hasApiKey(activity: Activity): Boolean = try {
            activity.assets.open("api_key.txt").bufferedReader().use { it.readText().isNotBlank() }
        } catch (_: IOException) {
            false
        }
    }
}
