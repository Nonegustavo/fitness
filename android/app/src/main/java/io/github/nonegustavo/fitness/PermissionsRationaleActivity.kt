package io.github.nonegustavo.fitness

import android.os.Bundle
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/** What the app does with the health data; Health Connect opens it from its permission screens. */
class PermissionsRationaleActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val padding = (24 * resources.displayMetrics.density).toInt()
        val text = TextView(this).apply {
            setText(R.string.health_privacy)
            textSize = 16f
            setPadding(padding, padding, padding, padding)
        }
        setContentView(ScrollView(this).apply { addView(text) })
    }
}
