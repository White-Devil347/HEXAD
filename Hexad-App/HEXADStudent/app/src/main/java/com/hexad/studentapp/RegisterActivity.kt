package com.hexad.studentapp

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.hexad.studentapp.databinding.ActivityRegisterBinding

class RegisterActivity : AppCompatActivity() {
    private lateinit var binding: ActivityRegisterBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityRegisterBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.registerButton.setOnClickListener {
            Toast.makeText(
                this,
                "Registration is handled by the college. Please use your provided account.",
                Toast.LENGTH_LONG
            ).show()
        }

        binding.loginLink.setOnClickListener {
            finish()
        }
    }
}
