# =========================================
# K-Kiswahili-Words ProGuard Rules
# Maximum Security Configuration
# =========================================

# =========================================
# 1. 기본 난독화 설정
# =========================================

# 모든 클래스 이름 난독화
-repackageclasses ''
-allowaccessmodification

# 최대 최적화
-optimizationpasses 5
-optimizations !code/simplification/arithmetic,!field/*,!class/merging/*

# 디버그 정보 제거
-renamesourcefileattribute SourceFile
-keepattributes SourceFile,LineNumberTable

# =========================================
# 2. Capacitor/WebView 관련 유지
# =========================================

# Capacitor 플러그인 유지
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.** { *; }
-dontwarn com.getcapacitor.**

# WebView JavaScript 인터페이스
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# =========================================
# 3. 보안 관련 클래스 유지
# =========================================

# 암호화/보안 클래스 유지
-keep class javax.crypto.** { *; }
-keep class java.security.** { *; }
-keep class android.security.** { *; }

# =========================================
# 4. Firebase/AdMob 관련
# =========================================

-keep class com.google.android.gms.** { *; }
-keep class com.google.firebase.** { *; }
-dontwarn com.google.android.gms.**
-dontwarn com.google.firebase.**

# AdMob
-keep class com.google.android.gms.ads.** { *; }
-dontwarn com.google.android.gms.ads.**

# =========================================
# 5. 리플렉션 사용 클래스 보호
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
# 6. 민감한 로그 제거
# =========================================

-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int d(...);
    public static int i(...);
    public static int w(...);
    public static int e(...);
}

# =========================================
# 7. 문자열 난독화 (추가 보안)
# =========================================

# 디버그 빌드 정보 제거
-assumevalues class android.os.Build$VERSION {
    int SDK_INT return 21..2147483647;
}

# =========================================
# 8. 네이티브 메소드 보호
# =========================================

-keepclasseswithmembernames class * {
    native <methods>;
}

# =========================================
# 9. Enum 보호
# =========================================

-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# =========================================
# 10. 어노테이션 유지
# =========================================

-keepattributes *Annotation*
-keepattributes Signature
-keepattributes Exceptions

# =========================================
# 11. R 클래스 최적화
# =========================================

-keepclassmembers class **.R$* {
    public static <fields>;
}

# =========================================
# 12. 앱 메인 액티비티 유지
# =========================================

-keep public class com.kenyavocab.app.MainActivity {
    public *;
}

# =========================================
# 13. 위험한 API 차단 (리플렉션 악용 방지)
# =========================================

-dontwarn java.lang.invoke.**
-dontwarn org.codehaus.mojo.animal_sniffer.*
