plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/** A table address baked into the build. Defaults to the public site. Override with `-Pfireverse.tableUrl=http://192.168.1.20:3100`. */
val tableUrl = (findProperty("fireverse.tableUrl") as String?)?.takeIf { it.isNotBlank() }
    ?: "https://www.d20fireverse.it/"

/** Release signing comes from the environment; without it the release build is signed with the debug key. */
val keystorePath: String? = System.getenv("FIREVERSE_KEYSTORE")

/**
 * The Login with Amazon SDK may not be redistributed, so it is not in git: scripts/fetch-lwa-sdk.sh
 * drops it in libs/. Without it the app builds with a stub and the page offers the test account.
 */
val lwaJar = file("libs/login-with-amazon-sdk.jar")
val withLwa = lwaJar.isFile

android {
    namespace = "com.d20fireverse.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.d20fireverse.tv"
        minSdk = 22
        targetSdk = 35
        versionCode = 6
        versionName = "1.0.5"
        buildConfigField("String", "DEFAULT_TABLE_URL", "\"$tableUrl\"")
        manifestPlaceholders["lwaEnabled"] = withLwa.toString()
    }

    sourceSets {
        getByName("main") {
            java.srcDir(if (withLwa) "src/lwa/java" else "src/nolwa/java")
        }
    }

    signingConfigs {
        create("release") {
            if (keystorePath != null) {
                storeFile = file(keystorePath)
                storePassword = System.getenv("FIREVERSE_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("FIREVERSE_KEY_ALIAS")
                keyPassword = System.getenv("FIREVERSE_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = if (keystorePath != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    if (withLwa) implementation(files(lwaJar))
}
