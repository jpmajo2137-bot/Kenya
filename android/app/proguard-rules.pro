# =========================================
# K-Kiswahili-Words ProGuard / R8 Rules
# Capacitor 앱 호환 + 강화된 난독화
# =========================================

# =========================================
# 1. 기본 최적화/난독화 설정
# =========================================
-optimizationpasses 5
-dontusemixedcaseclassnames
-dontskipnonpubliclibraryclasses
-dontpreverify

# 더 공격적인 최적화 활성화
-allowaccessmodification
-mergeinterfacesaggressively
-overloadaggressively
-repackageclasses ''

# 디버그 정보 제거 (역공학 어렵게)
# 주의: 크래시 분석시 재변환을 위해 R8이 생성하는 mapping.txt 를 보관하세요.
# build/outputs/mapping/release/mapping.txt
-renamesourcefileattribute SourceFile
-keepattributes SourceFile,LineNumberTable

# 로그 호출 완전 제거 (release 에서)
-assumenosideeffects class android.util.Log {
    public static *** v(...);
    public static *** d(...);
    public static *** i(...);
    public static *** w(...);
    public static *** e(...);
    public static *** wtf(...);
}

# System.out / err.print 도 제거
-assumenosideeffects class java.io.PrintStream {
    public *** println(...);
    public *** print(...);
}

# 디버그용 Throwable.printStackTrace 제거
-assumenosideeffects class java.lang.Throwable {
    public void printStackTrace();
}

# =========================================
# 2. Capacitor / WebView 필수 유지
# =========================================
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.** { *; }
-keep interface com.getcapacitor.** { *; }
-dontwarn com.getcapacitor.**
-dontwarn com.capacitorjs.**

# Capacitor Community 플러그인
-keep class com.getcapacitor.community.** { *; }
-dontwarn com.getcapacitor.community.**

# Capawesome
-keep class io.capawesome.capacitorjs.** { *; }
-dontwarn io.capawesome.**

# BridgeActivity 유지
-keep class * extends com.getcapacitor.BridgeActivity { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep @com.getcapacitor.annotation.PluginMethod class * { *; }

# WebView JavaScript 인터페이스 (필수)
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# WebView 관련
-keep class android.webkit.** { *; }
-keep class * implements android.webkit.WebViewClient { *; }
-keep class * implements android.webkit.WebChromeClient { *; }

# =========================================
# 3. 앱 메인 진입점만 유지 (나머지는 난독화)
# =========================================
-keep class com.kenyavocab.app.MainActivity { *; }

# Application 클래스 (있는 경우)
-keep class * extends android.app.Application { *; }

# =========================================
# 4. Firebase / AdMob (런타임 리플렉션 사용)
# =========================================
-keep class com.google.android.gms.** { *; }
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.ads.** { *; }
-dontwarn com.google.android.gms.**
-dontwarn com.google.firebase.**

# Play Services 광고 ID
-keep class com.google.android.gms.common.** { *; }

# =========================================
# 5. AndroidX
# =========================================
-dontwarn androidx.**
-dontwarn android.support.**

# EdgeToEdge (SDK 35+ edge-to-edge 대응)
-keep class androidx.activity.EdgeToEdge { *; }
-keep class androidx.activity.EdgeToEdge$* { *; }

# SplashScreen
-keep class androidx.core.splashscreen.** { *; }

# =========================================
# 6. 암호화 / 보안 클래스 (리플렉션 사용)
# =========================================
-keep class javax.crypto.** { *; }
-keep class java.security.** { *; }
-keep class android.security.** { *; }
-keep class javax.net.ssl.** { *; }

# =========================================
# 7. Parcelable / Serializable
# =========================================
-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}

-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# =========================================
# 8. Enum 보호
# =========================================
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# =========================================
# 9. 어노테이션
# =========================================
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes Exceptions
-keepattributes InnerClasses
-keepattributes EnclosingMethod
-keepattributes RuntimeVisibleAnnotations
-keepattributes RuntimeVisibleParameterAnnotations
-keepattributes RuntimeVisibleTypeAnnotations

# =========================================
# 10. 네이티브 메서드
# =========================================
-keepclasseswithmembernames class * {
    native <methods>;
}

# =========================================
# 11. R 클래스
# =========================================
-keepclassmembers class **.R$* {
    public static <fields>;
}

# =========================================
# 12. 추가 경고 무시
# =========================================
-dontwarn java.lang.invoke.**
-dontwarn org.codehaus.mojo.animal_sniffer.*
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn retrofit2.**
-dontwarn kotlin.**
-dontwarn kotlinx.**

# =========================================
# 13. Cordova 호환 (Capacitor 가 일부 사용)
# =========================================
-keep class org.apache.cordova.** { *; }
-dontwarn org.apache.cordova.**

# =========================================
# 14. 매핑 파일은 R8 이 build/outputs/mapping/release/mapping.txt 에 자동 생성합니다.
# 크래시 디스이로닝(역난독화)에 필요하므로 안전하게 보관하세요.
# =========================================
