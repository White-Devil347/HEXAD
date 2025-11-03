package com.hexad.studentapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.lifecycle.viewmodel.compose.viewModel
import com.hexad.studentapp.ui.theme.HEXADStudentTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            HEXADStudentTheme {
                val vm: AttendanceViewModel = viewModel()
                MainScreen(vm = vm)
            }
        }
    }
}

@Composable
private fun MainScreen(vm: AttendanceViewModel) {
    Scaffold(
        modifier = Modifier.fillMaxSize(),
        floatingActionButton = {
            FloatingActionButton(onClick = { vm.checkInNow() }) {
                Icon(Icons.Default.Add, contentDescription = "Check in")
            }
        }
    ) { innerPadding ->
        AttendanceList(
            records = vm.records,
            modifier = Modifier.padding(innerPadding)
        )
    }
}

@Composable
private fun AttendanceList(records: List<AttendanceRecord>, modifier: Modifier = Modifier) {
    LazyColumn(modifier = modifier) {
        items(records, key = { it.id }) { rec ->
            Text(text = "Checked in: ${'$'}{rec.timestampMillis} (${ '$' }{rec.status})")
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun PreviewMain() {
    HEXADStudentTheme {
        MainScreen(vm = AttendanceViewModel())
    }
}