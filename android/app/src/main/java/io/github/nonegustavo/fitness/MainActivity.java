package io.github.nonegustavo.fitness;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugins register before the bridge starts.
        registerPlugin(HealthConnectPlugin.class);
        super.onCreate(savedInstanceState);
        // Opened from a shortcut or the widget: start on that screen.
        String route = routeOf(getIntent());
        if (route != null) {
            String url = bridge.getAppUrl() + "#/" + route;
            bridge.getWebView().post(() -> bridge.getWebView().loadUrl(url));
        }
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
