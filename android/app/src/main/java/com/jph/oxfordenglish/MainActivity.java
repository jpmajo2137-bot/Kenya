package com.jph.oxfordenglish;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Android 15/16 EdgeToEdge: scrim 을 TRANSPARENT 로 두면 시스템 라이트 모드에서
        // status bar 가 자동으로 흰색 scrim 으로 fallback 되어 상단에 흰 배너처럼 보인다.
        // 앱 다크 색을 명시적으로 scrim 으로 지정해 라이트/다크 모드 둘 다 다크 배경 강제.
        int dark = Color.parseColor("#070a12");
        EdgeToEdge.enable(
            this,
            SystemBarStyle.dark(dark),
            SystemBarStyle.dark(dark)
        );

        super.onCreate(savedInstanceState);

        // EdgeToEdge 모드에서 status bar inset 영역에 노출되는 root view 배경을 다크 강제.
        // (setStatusBarColor 는 Android 15+ EdgeToEdge 모드에서 무시됨)
        getWindow().getDecorView().setBackgroundColor(dark);

        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().setBackgroundColor(dark);
        }

        // core-splashscreen 등 라이브러리가 내부적으로 SHORT_EDGES를 설정할 수 있으므로
        // ALWAYS로 강제 오버라이드 (Play Console "지원 중단 API" 경고 방지)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            Window window = getWindow();
            window.getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            window.setAttributes(window.getAttributes());
        }
    }
}
