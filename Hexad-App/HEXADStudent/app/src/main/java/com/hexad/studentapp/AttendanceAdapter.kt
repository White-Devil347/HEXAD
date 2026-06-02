package com.hexad.studentapp

import android.graphics.Typeface
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.hexad.studentapp.data.AttendanceEntity
import com.hexad.studentapp.data.AttendanceState
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class AttendanceAdapter(private var items: List<AttendanceEntity>) : RecyclerView.Adapter<AttendanceAdapter.ViewHolder>() {

    private val formatter = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault())

    fun submit(newItems: List<AttendanceEntity>) {
        items = newItems
        notifyDataSetChanged()
    }

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val mainText: TextView = view.findViewById(android.R.id.text1)
        val subText: TextView = view.findViewById(android.R.id.text2)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val v = LayoutInflater.from(parent.context).inflate(android.R.layout.simple_list_item_2, parent, false)
        return ViewHolder(v)
    }

    private fun stateColor(holder: ViewHolder, state: AttendanceState): Int {
        val ctx = holder.itemView.context
        return when (state) {
            AttendanceState.CONFIRMED -> 0xFF2E7D32.toInt() // green
            AttendanceState.PENDING_LOCAL -> 0xFFF9A825.toInt() // yellow
            AttendanceState.SYNCING -> 0xFF1565C0.toInt() // blue
            AttendanceState.FAILED,
            AttendanceState.REJECTED,
            AttendanceState.OUT_OF_GEOFENCE -> 0xFFC62828.toInt() // red
        }
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = items[position]
        val formattedTime = formatter.format(Date(item.timestamp))

        val badge = item.state.name
        holder.mainText.text = "[$badge] ${item.sessionCode}"
        holder.mainText.setTypeface(holder.mainText.typeface, Typeface.BOLD)
        holder.mainText.setTextColor(stateColor(holder, item.state))

        val reason = item.failureReason?.takeIf { it.isNotBlank() }
        holder.subText.text = buildString {
            append("$formattedTime | ${item.studentId}")
            if (reason != null) {
                append("\n")
                append(reason)
            }
        }
    }

    override fun getItemCount(): Int = items.size
}
