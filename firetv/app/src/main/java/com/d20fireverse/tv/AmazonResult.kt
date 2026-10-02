package com.d20fireverse.tv

/** What a Login with Amazon attempt hands back to the page. Codes match the table's error texts. */
sealed interface AmazonResult {
    data class Token(val accessToken: String) : AmazonResult
    data class Failed(val code: String) : AmazonResult

    companion object {
        const val NOT_CONFIGURED = "AMAZON_NOT_CONFIGURED"
        const val CANCELLED = "AMAZON_CANCELLED"
        const val FAILED = "AMAZON_FAILED"
    }
}
