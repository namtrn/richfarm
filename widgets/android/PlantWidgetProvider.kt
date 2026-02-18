package com.mygarden.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.mygarden.app.R
import android.content.SharedPreferences

class PlantWidgetProvider : AppWidgetProvider() {
    
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        
        if (intent.action == ACTION_REFRESH) {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(
                android.content.ComponentName(context, PlantWidgetProvider::class.java)
            )
            onUpdate(context, appWidgetManager, appWidgetIds)
        }
    }
    
    companion object {
        const val ACTION_REFRESH = "com.mygarden.app.widget.ACTION_REFRESH"
        const val ACTION_WATER_PLANT = "com.mygarden.app.widget.ACTION_WATER_PLANT"
        
        fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val prefs = context.getSharedPreferences("widget_data", Context.MODE_PRIVATE)
            
            val plantCount = prefs.getInt("plantCount", 0)
            val nextWatering = prefs.getString("nextWatering", "--:--") ?: "--:--"
            val nextWateringPlant = prefs.getString("nextWateringPlant", "Không có") ?: "Không có"
            val hasOverdue = prefs.getBoolean("hasOverdue", false)
            
            val views = RemoteViews(context.packageName, R.layout.widget_plant)
            
            // Update data
            views.setTextViewText(R.id.widget_plant_count, plantCount.toString())
            views.setTextViewText(R.id.widget_next_watering_time, nextWatering)
            views.setTextViewText(R.id.widget_next_watering_plant, nextWateringPlant)
            
            // Show/hide overdue warning
            if (hasOverdue) {
                views.setViewVisibility(R.id.widget_overdue_warning, android.view.View.VISIBLE)
            } else {
                views.setViewVisibility(R.id.widget_overdue_warning, android.view.View.GONE)
            }
            
            // Open app intent
            val openAppIntent = Intent(context, com.mygarden.app.MainActivity::class.java)
            val openAppPendingIntent = PendingIntent.getActivity(
                context, 0, openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_container, openAppPendingIntent)
            
            // Water plant action
            val waterIntent = Intent(context, PlantWidgetProvider::class.java).apply {
                action = ACTION_WATER_PLANT
            }
            val waterPendingIntent = PendingIntent.getBroadcast(
                context, 0, waterIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_water_button, waterPendingIntent)
            
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
