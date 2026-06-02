package com.hexad.studentapp

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // This activity is not used now; launcher is LoginActivity in manifest.
        finish()
    }
}
