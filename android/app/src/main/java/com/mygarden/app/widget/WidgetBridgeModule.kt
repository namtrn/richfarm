package com.mygarden.app.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import com.facebook.react.bridge.*

class WidgetBridgeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    override fun getName(): String {
        return "WidgetBridge"
    }
    
    @ReactMethod
    fun updateWidget(plantCount: Int, nextWatering: String, nextWateringPlant: String, hasOverdue: Boolean) {
        val context = reactApplicationContext
        Log.d(TAG, "updateWidget plantCount=$plantCount nextWatering=$nextWatering nextWateringPlant=$nextWateringPlant hasOverdue=$hasOverdue")
        val prefs = context.getSharedPreferences("widget_data", Context.MODE_PRIVATE)
        
        prefs.edit().apply {
            putInt("plantCount", plantCount)
            putString("nextWatering", nextWatering)
            putString("nextWateringPlant", nextWateringPlant)
            putBoolean("hasOverdue", hasOverdue)
            apply()
        }
        
        // Update widgets
        val appWidgetManager = AppWidgetManager.getInstance(context)
        val appWidgetIds = appWidgetManager.getAppWidgetIds(
            ComponentName(context, PlantWidgetProvider::class.java)
        )
        
        for (appWidgetId in appWidgetIds) {
            PlantWidgetProvider.updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }
    
    @ReactMethod
    fun reloadWidgets() {
        val context = reactApplicationContext
        Log.d(TAG, "reloadWidgets")
        val appWidgetManager = AppWidgetManager.getInstance(context)
        val appWidgetIds = appWidgetManager.getAppWidgetIds(
            ComponentName(context, PlantWidgetProvider::class.java)
        )
        
        val intent = Intent(context, PlantWidgetProvider::class.java).apply {
            action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, appWidgetIds)
        }
        context.sendBroadcast(intent)
    }
    
    @ReactMethod
    fun isWidgetAdded(promise: Promise) {
        val context = reactApplicationContext
        val appWidgetManager = AppWidgetManager.getInstance(context)
        val appWidgetIds = appWidgetManager.getAppWidgetIds(
            ComponentName(context, PlantWidgetProvider::class.java)
        )
        Log.d(TAG, "isWidgetAdded count=${appWidgetIds.size}")
        promise.resolve(appWidgetIds.isNotEmpty())
    }

    companion object {
        private const val TAG = "WidgetBridge"
    }
}
