# =========================================
# K-Kiswahili-Words ProGuard Rules
# Capacitor 앱 호환 설정
# =========================================

# =========================================
# 1. 기본 설정
# =========================================

# 최적화 패스
-optimizationpasses 3
-dontusemixedcaseclassnames
-dontskipnonpubliclibraryclasses
-verbose

# 디버그 정보 유지 (크래시 분석용)
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# =========================================
# 2. Capacitor/WebView 필수 유지
# =========================================

# Capacitor 전체 유지 (중요!)
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.** { *; }
-keep interface com.getcapacitor.** { *; }
-dontwarn com.getcapacitor.**
-dontwarn com.capacitorjs.**

# Capacitor 플러그인
-keep class com.getcapacitor.community.** { *; }
-dontwarn com.getcapacitor.community.**

# BridgeActivity 유지
-keep class * extends com.getcapacitor.BridgeActivity { *; }

# WebView JavaScript 인터페이스
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# WebView 관련
-keep class android.webkit.** { *; }
-keep class * implements android.webkit.WebViewClient { *; }
-keep class * implements android.webkit.WebChromeClient { *; }

# =========================================
# 3. 앱 메인 클래스
# =========================================

-keep public class com.kenyavocab.app.** { *; }

# =========================================
# 4. Firebase/AdMob
# =========================================

-keep class com.google.android.gms.** { *; }
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.ads.** { *; }
-dontwarn com.google.android.gms.**
-dontwarn com.google.firebase.**

# =========================================
# 5. AndroidX/Support Libraries
# =========================================

-keep class androidx.** { *; }
-keep interface androidx.** { *; }
-dontwarn androidx.**

-keep class android.support.** { *; }
-dontwarn android.support.**

# =========================================
# 6. 암호화/보안 클래스
# =========================================

-keep class javax.crypto.** { *; }
-keep class java.security.** { *; }
-keep class android.security.** { *; }

# =========================================
# 7. 리플렉션/직렬화
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

# =========================================
# 10. 네이티브 메소드
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
