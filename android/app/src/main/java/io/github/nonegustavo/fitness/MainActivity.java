package io.github.nonegustavo.fitness;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugins register before the bridge starts.
        registerPlugin(HealthConnectPlugin.class);
        registerPlugin(WidgetPlugin.class);
        registerPlugin(WorkoutPlugin.class);
        super.onCreate(savedInstanceState);
        // Opened from a shortcut or the widget: start on that screen.
        String route = routeOf(getIntent());
        if (route != null) {
            String url = bridge.getAppUrl() + "#/" + route;
            bridge.getWebView().post(() -> bridge.getWebView().loadUrl(url));
        }

        // Back works inside the app: it closes an open sheet first (the page decides, through
        // window.fitnessBack), then goes to the previous screen, and only from the first screen
        // does it leave, keeping the app in the background instead of closing it.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = bridge.getWebView();
                webView.evaluateJavascript("window.fitnessBack ? window.fitnessBack() : 'none'", result -> {
                    if ("\"handled\"".equals(result)) return;
                    if (webView.canGoBack()) webView.goBack();
                    else moveTaskToBack(true);
                });
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Already open: move the app (a hash router) to that screen.
        String route = routeOf(intent);
        if (route != null) {
            bridge.getWebView().evaluateJavascript("location.hash = " + JSONObject.quote("#/" + route), null);
        }
    }

    /** "alimentacao/adicionar" from fitness://app/alimentacao/adicionar; null for any other launch. */
    private static String routeOf(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return null;
        Uri data = intent.getData();
        if (data == null || !"fitness".equals(data.getScheme()) || !"app".equals(data.getHost())) return null;
        String path = data.getPath() == null ? "" : data.getPath().replaceFirst("^/", "");
        String query = data.getQuery();
        return query == null ? path : path + "?" + query;
    }
}
