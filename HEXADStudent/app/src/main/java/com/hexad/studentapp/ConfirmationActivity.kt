package com.hexad.studentapp

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.hexad.studentapp.databinding.ActivityConfirmationBinding

class ConfirmationActivity : AppCompatActivity() {

    private lateinit var binding: ActivityConfirmationBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityConfirmationBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Display saved data
        val prefs = getSharedPreferences("attendance", MODE_PRIVATE)
        val data = prefs.getString("last_attendance", "No data")
        binding.attendanceDataTextView.text = data

        binding.backToSessionButton.setOnClickListener {
            val intent = Intent(this, SessionCodeActivity::class.java)
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            startActivity(intent)
            finish()
        }
    }
}
