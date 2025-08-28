package com.fineprintai.mobile.quicksettings

import android.annotation.TargetApi
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.util.Log
import com.fineprintai.mobile.MainActivity
import com.fineprintai.mobile.R

@TargetApi(Build.VERSION_CODES.N)
class QuickScanTileService : TileService() {

    companion object {
        private const val TAG = "QuickScanTileService"
        const val QUICK_SCAN_ACTION = "com.fineprintai.mobile.QUICK_SCAN"
    }

    override fun onTileAdded() {
        super.onTileAdded()
        Log.d(TAG, "Quick Scan tile added")
        updateTile(false)
    }

    override fun onTileRemoved() {
        super.onTileRemoved()
        Log.d(TAG, "Quick Scan tile removed")
    }

    override fun onStartListening() {
        super.onStartListening()
        Log.d(TAG, "Quick Scan tile listening started")
        updateTile(false)
    }

    override fun onStopListening() {
        super.onStopListening()
        Log.d(TAG, "Quick Scan tile listening stopped")
    }

    override fun onClick() {
        super.onClick()
        Log.d(TAG, "Quick Scan tile clicked")
        
        // Update tile to show active state
        updateTile(true)
        
        // Launch app with scan intent
        launchScanActivity()
        
        // Reset tile state after a short delay
        android.os.Handler(mainLooper).postDelayed({
            updateTile(false)
        }, 1000)
    }

    private fun updateTile(isActive: Boolean) {
        val tile = qsTile ?: return

        tile.label = if (isActive) "Scanning..." else "Fine Print Scan"
        tile.contentDescription = if (isActive) 
            "Fine Print AI is launching document scanner" else 
            "Tap to scan a legal document with Fine Print AI"

        // Set tile icon
        val iconRes = if (isActive) R.drawable.ic_scan_active else R.drawable.ic_scan_inactive
        tile.icon = Icon.createWithResource(this, iconRes)

        // Set tile state
        tile.state = if (isActive) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE

        // Update the tile
        tile.updateTile()
    }

    private fun launchScanActivity() {
        try {
            val intent = Intent(this, MainActivity::class.java).apply {
                action = QUICK_SCAN_ACTION
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra("deepLink", "fineprintai://scan")
                putExtra("source", "quick_settings")
            }
            
            startActivityAndCollapse(intent)
            Log.d(TAG, "Launched scan activity from Quick Settings")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch scan activity", e)
        }
    }
}

@TargetApi(Build.VERSION_CODES.N)
class QuickDashboardTileService : TileService() {

    companion object {
        private const val TAG = "QuickDashboardTileService"
        const val QUICK_DASHBOARD_ACTION = "com.fineprintai.mobile.QUICK_DASHBOARD"
    }

    override fun onTileAdded() {
        super.onTileAdded()
        Log.d(TAG, "Quick Dashboard tile added")
        updateTile()
    }

    override fun onStartListening() {
        super.onStartListening()
        updateTile()
    }

    override fun onClick() {
        super.onClick()
        Log.d(TAG, "Quick Dashboard tile clicked")
        launchDashboard()
    }

    private fun updateTile() {
        val tile = qsTile ?: return

        tile.label = "FP Dashboard"
        tile.contentDescription = "Open Fine Print AI dashboard to view risk analysis"
        tile.icon = Icon.createWithResource(this, R.drawable.ic_dashboard)
        tile.state = Tile.STATE_INACTIVE

        tile.updateTile()
    }

    private fun launchDashboard() {
        try {
            val intent = Intent(this, MainActivity::class.java).apply {
                action = QUICK_DASHBOARD_ACTION
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra("deepLink", "fineprintai://dashboard")
                putExtra("source", "quick_settings")
            }
            
            startActivityAndCollapse(intent)
            Log.d(TAG, "Launched dashboard from Quick Settings")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch dashboard", e)
        }
    }
}

@TargetApi(Build.VERSION_CODES.N)
class QuickRiskAlertTileService : TileService() {

    companion object {
        private const val TAG = "QuickRiskAlertTileService"
        const val QUICK_RISK_ALERT_ACTION = "com.fineprintai.mobile.QUICK_RISK_ALERT"
        private const val PREFS_NAME = "FinePrintWidgetPrefs"
    }

    override fun onTileAdded() {
        super.onTileAdded()
        Log.d(TAG, "Quick Risk Alert tile added")
        updateTile()
    }

    override fun onStartListening() {
        super.onStartListening()
        updateTile()
    }

    override fun onClick() {
        super.onClick()
        Log.d(TAG, "Quick Risk Alert tile clicked")
        launchHighRiskDocuments()
    }

    private fun updateTile() {
        val tile = qsTile ?: return
        
        // Check if there are new alerts
        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        val hasNewAlerts = prefs.getBoolean("has_new_alerts", false)
        val riskScore = prefs.getFloat("latest_risk_score", 0.0f)

        tile.label = if (hasNewAlerts) "Risk Alert!" else "Risk Monitor"
        tile.contentDescription = if (hasNewAlerts) 
            "High risk documents found - tap to review" else 
            "Monitor document risk levels"

        val iconRes = if (hasNewAlerts) R.drawable.ic_alert_high else R.drawable.ic_shield
        tile.icon = Icon.createWithResource(this, iconRes)

        tile.state = when {
            hasNewAlerts -> Tile.STATE_ACTIVE
            riskScore > 0.7f -> Tile.STATE_ACTIVE
            else -> Tile.STATE_INACTIVE
        }

        tile.updateTile()
    }

    private fun launchHighRiskDocuments() {
        try {
            val intent = Intent(this, MainActivity::class.java).apply {
                action = QUICK_RISK_ALERT_ACTION
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra("deepLink", "fineprintai://documents?filter=high-risk")
                putExtra("source", "quick_settings")
            }
            
            startActivityAndCollapse(intent)
            Log.d(TAG, "Launched high risk documents from Quick Settings")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch high risk documents", e)
        }
    }
}