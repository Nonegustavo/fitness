package io.github.nonegustavo.fitness;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

/** Home-screen widget: four buttons that open the app on the screens used every day. */
public class QuickWidget extends AppWidgetProvider {
    private static final int[] BUTTONS = {
        R.id.widget_food, R.id.widget_water, R.id.widget_workout, R.id.widget_weight
    };
    private static final String[] ROUTES = {
        "alimentacao/adicionar", "agua", "treinos", "corpo?novo=peso"
    };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.quick_widget);
        for (int i = 0; i < BUTTONS.length; i++) {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("fitness://app/" + ROUTES[i]), context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent pending = PendingIntent.getActivity(
                context, i, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(BUTTONS[i], pending);
        }
        for (int id : widgetIds) manager.updateAppWidget(id, views);
    }
}
