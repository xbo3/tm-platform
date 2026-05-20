plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.tm.bicall"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.tm.bicall"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.3.0"

        // Default BuildConfig fields — overridden per flavor below.
        buildConfigField("String", "SERVER_URL", "\"https://tm-web-production.up.railway.app\"")
        buildConfigField("String", "DEFAULT_EMAIL", "\"\"")
        buildConfigField("String", "DEFAULT_PASSWORD", "\"\"")
        buildConfigField("String", "AGENT_LETTER", "\"?\"")
    }

    buildFeatures {
        buildConfig = true
    }

    flavorDimensions += "agent"

    productFlavors {
        create("agentA") {
            dimension = "agent"
            applicationIdSuffix = ".a"
            versionNameSuffix = "-A"
            resValue("string", "app_name", "bicall · A")
            buildConfigField("String", "SERVER_URL", "\"https://tm-web-production.up.railway.app\"")
            buildConfigField("String", "DEFAULT_EMAIL", "\"agenta@tm.co.kr\"")
            buildConfigField("String", "DEFAULT_PASSWORD", "\"agent123\"")
            buildConfigField("String", "AGENT_LETTER", "\"A\"")
        }
        create("agentB") {
            dimension = "agent"
            applicationIdSuffix = ".b"
            versionNameSuffix = "-B"
            resValue("string", "app_name", "bicall · B")
            buildConfigField("String", "SERVER_URL", "\"https://tm-web-production.up.railway.app\"")
            buildConfigField("String", "DEFAULT_EMAIL", "\"agentb@tm.co.kr\"")
            buildConfigField("String", "DEFAULT_PASSWORD", "\"agent123\"")
            buildConfigField("String", "AGENT_LETTER", "\"B\"")
        }
    }

    buildTypes {
        release { isMinifyEnabled = false }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
