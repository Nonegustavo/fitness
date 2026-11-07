package io.github.nonegustavo.fitness;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Home-screen widget: the day's calories, macros and water against the goals and the next workout,
 * as the app last sent them through WidgetPlugin, and four buttons that open the app on the screens
 * used every day.
 */
public class QuickWidget extends AppWidgetProvider {
    static final String PREFS = "widget";
    static final String[] KEYS = {
        "date", "kcal", "kcalLabel", "kcalDetail", "kcalProgress", "kcalOver",
        "carbs", "carbsProgress", "protein", "proteinProgress", "fat", "fatProgress",
        "water", "waterProgress", "agenda", "next"
    };

    private static final int LABEL = 0xFFC3C2B7;
    private static final int AMBER = 0xFFFBBF24;
    private static final String[] WEEKDAYS = {"seg", "ter", "qua", "qui", "sex", "sáb", "dom"};

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
        LocalDate today = LocalDate.now();
        // Numbers from another day would be wrong: dashes and empty bars until the app opens and sends today's.
        boolean fresh = today.toString().equals(prefs.getString("date", ""));

        boolean over = fresh && "true".equals(prefs.getString("kcalOver", ""));
        views.setTextViewText(R.id.widget_kcal, fresh ? prefs.getString("kcal", "—") : "—");
        views.setTextViewText(R.id.widget_kcal_label, fresh ? prefs.getString("kcalLabel", "kcal") : "kcal");
        views.setTextColor(R.id.widget_kcal_label, over ? AMBER : LABEL);
        views.setTextViewText(R.id.widget_kcal_detail, fresh ? prefs.getString("kcalDetail", "") : "abra o app para atualizar");
        bar(views, R.id.widget_kcal_bar, prefs.getString("kcalProgress", "-1"), fresh);
        if (over) {
            views.setViewVisibility(R.id.widget_kcal_bar, View.GONE);
            views.setViewVisibility(R.id.widget_kcal_bar_over, View.VISIBLE);
        }
        meter(views, R.id.widget_carbs, R.id.widget_carbs_bar, prefs, "carbs", fresh);
        meter(views, R.id.widget_protein, R.id.widget_protein_bar, prefs, "protein", fresh);
        meter(views, R.id.widget_fat, R.id.widget_fat_bar, prefs, "fat", fresh);
        meter(views, R.id.widget_water_value, R.id.widget_water_bar, prefs, "water", fresh);

        Workout next = nextWorkout(prefs, today);
        views.setTextViewText(R.id.widget_next, next.title);
        views.setTextViewText(R.id.widget_next_label, next.when);
        views.setImageViewResource(R.id.widget_next_icon, next.icon);
        views.setInt(R.id.widget_next_icon, "setColorFilter", next.color);
        views.setInt(R.id.widget_next_icon, "setBackgroundResource", next.tile);

        for (int i = 0; i < BUTTONS.length; i++) views.setOnClickPendingIntent(BUTTONS[i], open(context, i, ROUTES[i]));
        views.setOnClickPendingIntent(R.id.widget_kcal_box, open(context, 4, "alimentacao"));
        views.setOnClickPendingIntent(R.id.widget_macros, open(context, 5, "alimentacao"));
        views.setOnClickPendingIntent(R.id.widget_water_box, open(context, 6, "agua"));
        views.setOnClickPendingIntent(R.id.widget_next_box, open(context, 7, "calendario"));
        return views;
    }

    /** A value and its bar toward the goal. */
    private static void meter(RemoteViews views, int textId, int barId, SharedPreferences prefs, String key, boolean fresh) {
        views.setTextViewText(textId, fresh ? prefs.getString(key, "—") : "—");
        bar(views, barId, prefs.getString(key + "Progress", "-1"), fresh);
    }

    /** The fill the app sent (0–1000); a bar without a goal (-1) is hidden, and stays empty on a new day. */
    private static void bar(RemoteViews views, int id, String progress, boolean fresh) {
        int value;
        try {
            value = (int) Math.round(Double.parseDouble(progress));
        } catch (NumberFormatException e) {
            value = -1;
        }
        views.setViewVisibility(id, value < 0 ? View.INVISIBLE : View.VISIBLE);
        views.setProgressBar(id, 1000, fresh ? Math.max(value, 0) : 0, false);
    }

    private static final class Workout {
        final String title;
        final String when;
        final int icon;
        final int color;
        final int tile;

        Workout(String title, String when, String kind) {
            this.title = title;
            this.when = when;
            switch (kind) {
                // As in the app: a running shoe for runs, the footprints in blue for walks.
                case "run":
                    icon = R.drawable.widget_ic_sport_shoe;
                    color = 0xFF2DD4BF;
                    tile = R.drawable.widget_tile_today;
                    break;
                case "walk":
                    icon = R.drawable.widget_ic_footprints;
                    color = 0xFF60A5FA;
                    tile = R.drawable.widget_tile_walk;
                    break;
                case "ride":
                    icon = R.drawable.widget_ic_bike;
                    color = 0xFF2DD4BF;
                    tile = R.drawable.widget_tile_today;
                    break;
                case "swim":
                    icon = R.drawable.widget_ic_waves;
                    color = 0xFF38BDF8;
                    tile = R.drawable.widget_tile_water;
                    break;
                case "other":
                    icon = R.drawable.widget_ic_activity;
                    color = 0xFF94A3B8;
                    tile = R.drawable.widget_tile_other;
                    break;
                default:
                    icon = R.drawable.widget_ic_dumbbell;
                    color = 0xFFFB923C;
                    tile = R.drawable.widget_tile_training;
            }
        }
    }

    /**
     * The first workout from today on among those the app sent (scheduled templates, the Garmin
     * calendar, the one in progress), so it stays right after midnight; else the rotation's next.
     */
    private static Workout nextWorkout(SharedPreferences prefs, LocalDate today) {
        try {
            JSONArray agenda = new JSONArray(prefs.getString("agenda", "[]"));
            for (int i = 0; i < agenda.length(); i++) {
                JSONObject item = agenda.getJSONObject(i);
                LocalDate date = LocalDate.parse(item.getString("date"));
                if (date.isBefore(today)) continue;
                boolean active = item.optBoolean("active");
                String when;
                if (active) when = "em andamento";
                else if (date.equals(today)) when = "hoje";
                else if (date.equals(today.plusDays(1))) when = "amanhã";
                else when = WEEKDAYS[date.getDayOfWeek().getValue() - 1] + ", " + date.getDayOfMonth() + "/" + date.getMonthValue();
                String time = item.optString("time", "");
                if (!active && !time.isEmpty()) when += " às " + time;
                return new Workout(item.optString("title", "—"), when, item.optString("kind", "gym"));
            }
        } catch (JSONException | DateTimeParseException e) {
            // Unreadable: fall back to the rotation.
        }
        String next = prefs.getString("next", "");
        return next.isEmpty() ? new Workout("—", "sem ficha", "gym") : new Workout(next, "próxima ficha", "gym");
    }

    private static PendingIntent open(Context context, int requestCode, String route) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("fitness://app/" + route), context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(
            context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
