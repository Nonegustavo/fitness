package io.github.nonegustavo.fitness;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;
import java.time.LocalDate;

/**
 * Home-screen widget: the day's numbers (calories left, water, next workout), as the app last sent
 * them through WidgetPlugin, and four buttons that open the app on the screens used every day.
 */
public class QuickWidget extends AppWidgetProvider {
    static final String PREFS = "widget";
    static final String[] KEYS = {"date", "kcal", "kcalLabel", "water", "waterLabel", "workout", "workoutLabel"};

    private static final int[] BUTTONS = {
        R.id.widget_food, R.id.widget_water, R.id.widget_workout, R.id.widget_weight
    };
    private static final String[] ROUTES = {
        "alimentacao/adicionar", "agua", "treinos", "corpo?novo=peso"
    };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        RemoteViews views = build(context);
        for (int id : widgetIds) manager.updateAppWidget(id, views);
    }

    /** Redraws every copy of the widget on the home screen, after the app sends new numbers. */
    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, QuickWidget.class));
        if (ids.length == 0) return;
        RemoteViews views = build(context);
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    private static RemoteViews build(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.quick_widget);
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        // Numbers from another day would be wrong: dashes until the app opens and sends today's.
        boolean today = LocalDate.now().toString().equals(prefs.getString("date", ""));
        views.setTextViewText(R.id.widget_kcal, today ? prefs.getString("kcal", "—") : "—");
        views.setTextViewText(R.id.widget_kcal_label, today ? prefs.getString("kcalLabel", "kcal") : "abra o app");
        views.setTextViewText(R.id.widget_water_value, today ? prefs.getString("water", "—") : "—");
        views.setTextViewText(R.id.widget_water_label, today ? prefs.getString("waterLabel", "de água") : "de água");
        views.setTextViewText(R.id.widget_next, prefs.getString("workout", "—"));
        views.setTextViewText(R.id.widget_next_label, prefs.getString("workoutLabel", "próximo treino"));

        for (int i = 0; i < BUTTONS.length; i++) views.setOnClickPendingIntent(BUTTONS[i], open(context, i, ROUTES[i]));
        // The numbers open the day's food.
        views.setOnClickPendingIntent(R.id.widget_stats, open(context, BUTTONS.length, "alimentacao"));
        return views;
    }

    private static PendingIntent open(Context context, int requestCode, String route) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("fitness://app/" + route), context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(
            context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
