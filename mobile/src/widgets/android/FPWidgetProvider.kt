package com.fineprintai.mobile.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.net.Uri
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import com.fineprintai.mobile.MainActivity
import com.fineprintai.mobile.R
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.text.SimpleDateFormat
import java.util.*

class FPWidgetProvider : AppWidgetProvider() {

    companion object {
        const val WIDGET_ACTION_REFRESH = "com.fineprintai.mobile.WIDGET_REFRESH"
        const val WIDGET_ACTION_SCAN = "com.fineprintai.mobile.WIDGET_SCAN"
        const val WIDGET_ACTION_DASHBOARD = "com.fineprintai.mobile.WIDGET_DASHBOARD"
        const val PREFS_NAME = "FinePrintWidgetPrefs"
        
        private fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val widgetData = getWidgetData(context)
            val views = createRemoteViews(context, widgetData)
            
            // Set up click listeners
            setupClickListeners(context, views, appWidgetId)
            
            // Update the widget
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
        
        private fun getWidgetData(context: Context): WidgetData {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val gson = Gson()
            
            val riskScore = prefs.getFloat("latest_risk_score", 0.0f).toDouble()
            val hasNewAlerts = prefs.getBoolean("has_new_alerts", false)
            val lastUpdated = prefs.getString("last_updated", "") ?: ""
            val documentsJson = prefs.getString("recent_documents", "[]") ?: "[]"
            
            val type = object : TypeToken<List<DocumentSummary>>() {}.type
            val recentDocuments: List<DocumentSummary> = try {
                gson.fromJson(documentsJson, type) ?: emptyList()
            } catch (e: Exception) {
                emptyList()
            }
            
            return WidgetData(riskScore, recentDocuments, hasNewAlerts, lastUpdated)
        }
        
        private fun createRemoteViews(context: Context, data: WidgetData): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_fineprint)
            
            // Update risk score
            val riskPercentage = (data.riskScore * 100).toInt()
            views.setTextViewText(R.id.widget_risk_score, "${riskPercentage}%")
            
            // Update risk score color based on level
            val riskColor = when {
                data.riskScore < 0.3 -> ContextCompat.getColor(context, R.color.risk_low)
                data.riskScore < 0.7 -> ContextCompat.getColor(context, R.color.risk_medium)
                else -> ContextCompat.getColor(context, R.color.risk_high)
            }
            views.setTextColor(R.id.widget_risk_score, riskColor)
            
            // Update progress bar
            views.setProgressBar(R.id.widget_risk_progress, 100, riskPercentage, false)
            
            // Update alert indicator
            views.setViewVisibility(
                R.id.widget_alert_indicator,
                if (data.hasNewAlerts) RemoteViews.VISIBLE else RemoteViews.GONE
            )
            
            // Update recent documents
            updateRecentDocuments(context, views, data.recentDocuments)
            
            // Update last updated time
            if (data.lastUpdated.isNotEmpty()) {
                try {
                    val lastUpdatedDate = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
                        .parse(data.lastUpdated)
                    val timeAgo = getTimeAgo(lastUpdatedDate)
                    views.setTextViewText(R.id.widget_last_updated, "Updated $timeAgo")
                } catch (e: Exception) {
                    views.setTextViewText(R.id.widget_last_updated, "")
                }
            }
            
            return views
        }
        
        private fun updateRecentDocuments(
            context: Context,
            views: RemoteViews,
            documents: List<DocumentSummary>
        ) {
            // Clear existing document views
            views.removeAllViews(R.id.widget_documents_container)
            
            // Add up to 3 recent documents
            documents.take(3).forEachIndexed { index, document ->
                val docView = RemoteViews(context.packageName, R.layout.widget_document_item)
                
                docView.setTextViewText(R.id.document_name, document.name)
                docView.setTextViewText(R.id.document_risk, "${(document.riskScore * 100).toInt()}%")
                
                val riskColor = when {
                    document.riskScore < 0.3 -> ContextCompat.getColor(context, R.color.risk_low)
                    document.riskScore < 0.7 -> ContextCompat.getColor(context, R.color.risk_medium)
                    else -> ContextCompat.getColor(context, R.color.risk_high)
                }
                docView.setTextColor(R.id.document_risk, riskColor)
                
                // Set click listener for document
                val documentIntent = Intent(context, MainActivity::class.java).apply {
                    action = Intent.ACTION_VIEW
                    data = Uri.parse("fineprintai://document/${document.id}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                }
                val documentPendingIntent = PendingIntent.getActivity(
                    context,
                    1000 + index,
                    documentIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                docView.setOnClickPendingIntent(R.id.document_item_container, documentPendingIntent)
                
                views.addView(R.id.widget_documents_container, docView)
            }
        }
        
        private fun setupClickListeners(context: Context, views: RemoteViews, appWidgetId: Int) {
            // Dashboard click
            val dashboardIntent = Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_MAIN
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val dashboardPendingIntent = PendingIntent.getActivity(
                context,
                appWidgetId,
                dashboardIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_header, dashboardPendingIntent)
            
            // Scan document click
            val scanIntent = Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                data = Uri.parse("fineprintai://scan")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val scanPendingIntent = PendingIntent.getActivity(
                context,
                appWidgetId + 1000,
                scanIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_scan_button, scanPendingIntent)
            
            // Refresh click
            val refreshIntent = Intent(context, FPWidgetProvider::class.java).apply {
                action = WIDGET_ACTION_REFRESH
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
            }
            val refreshPendingIntent = PendingIntent.getBroadcast(
                context,
                appWidgetId + 2000,
                refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_refresh_button, refreshPendingIntent)
        }
        
        private fun getTimeAgo(date: Date?): String {
            if (date == null) return "recently"
            
            val now = System.currentTimeMillis()
            val diff = now - date.time
            
            return when {
                diff < 60 * 1000 -> "just now"
                diff < 60 * 60 * 1000 -> "${diff / (60 * 1000)}m ago"
                diff < 24 * 60 * 60 * 1000 -> "${diff / (60 * 60 * 1000)}h ago"
                else -> "${diff / (24 * 60 * 60 * 1000)}d ago"
            }
        }
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        // Update all widgets
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        
        when (intent.action) {
            WIDGET_ACTION_REFRESH -> {
                val appWidgetId = intent.getIntExtra(
                    AppWidgetManager.EXTRA_APPWIDGET_ID,
                    AppWidgetManager.INVALID_APPWIDGET_ID
                )
                if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                    val appWidgetManager = AppWidgetManager.getInstance(context)
                    updateAppWidget(context, appWidgetManager, appWidgetId)
                }
            }
        }
    }

    override fun onEnabled(context: Context) {
        // Enter relevant functionality for when the first widget is created
    }

    override fun onDisabled(context: Context) {
        // Enter relevant functionality for when the last widget is disabled
    }
}

// Data classes
data class WidgetData(
    val riskScore: Double,
    val recentDocuments: List<DocumentSummary>,
    val hasNewAlerts: Boolean,
    val lastUpdated: String
)

data class DocumentSummary(
    val id: String,
    val name: String,
    val riskScore: Double,
    val lastUpdated: String
)