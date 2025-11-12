package com.hexad.studentapp

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.hexad.studentapp.databinding.ActivitySessionCodeBinding

class SessionCodeActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySessionCodeBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySessionCodeBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.submitButton.setOnClickListener {
            val code = binding.sessionCodeEditText.text.toString()
            if (code == "12345") {
                Toast.makeText(this, "Code Verified", Toast.LENGTH_SHORT).show()
                startActivity(Intent(this, FingerprintActivity::class.java))
            } else {
                Toast.makeText(this, "Invalid or Expired Code", Toast.LENGTH_SHORT).show()
            }
        }
    }
}
