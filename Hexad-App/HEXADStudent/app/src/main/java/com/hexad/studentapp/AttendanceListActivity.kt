package com.hexad.studentapp

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.isVisible
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.hexad.studentapp.data.AttendanceDatabase
import com.hexad.studentapp.data.AttendanceEntity
import com.hexad.studentapp.data.AttendanceState
import com.hexad.studentapp.databinding.ActivityAttendanceListBinding
import com.hexad.studentapp.net.hasInternetCapability
import kotlinx.coroutines.launch

class AttendanceListActivity : AppCompatActivity() {

    private lateinit var binding: ActivityAttendanceListBinding
    private lateinit var adapter: AttendanceAdapter

    private var currentFilter: Filter = Filter.ALL

    private enum class Filter {
        ALL,
        PENDING,
        CONFIRMED,
        FAILED,
        REJECTED
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAttendanceListBinding.inflate(layoutInflater)
        setContentView(binding.root)

        adapter = AttendanceAdapter(emptyList())
        binding.attendanceRecycler.layoutManager = LinearLayoutManager(this)
        binding.attendanceRecycler.adapter = adapter

        // Offline banner
        binding.offlineBanner.isVisible = !applicationContext.hasInternetCapability()

        fun applyFilter(list: List<AttendanceEntity>): List<AttendanceEntity> {
            return when (currentFilter) {
                Filter.ALL -> list
                Filter.PENDING -> list.filter { it.state == AttendanceState.PENDING_LOCAL || it.state == AttendanceState.SYNCING }
                Filter.CONFIRMED -> list.filter { it.state == AttendanceState.CONFIRMED }
                Filter.FAILED -> list.filter { it.state == AttendanceState.FAILED }
                Filter.REJECTED -> list.filter { it.state == AttendanceState.REJECTED || it.state == AttendanceState.OUT_OF_GEOFENCE }
            }
        }

        fun setFilter(newFilter: Filter) {
            currentFilter = newFilter
        }

        binding.filterAll.setOnClickListener { setFilter(Filter.ALL) }
        binding.filterPending.setOnClickListener { setFilter(Filter.PENDING) }
        binding.filterConfirmed.setOnClickListener { setFilter(Filter.CONFIRMED) }
        binding.filterFailed.setOnClickListener { setFilter(Filter.FAILED) }
        binding.filterRejected.setOnClickListener { setFilter(Filter.REJECTED) }

        val dao = AttendanceDatabase.getInstance(this).attendanceDao()

        lifecycleScope.launch {
            dao.getAllFlow().collect { list ->
                adapter.submit(applyFilter(list))
            }
        }
    }
}
