package com.hexad.studentapp.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(entities = [AttendanceEntity::class], version = 3, exportSchema = false)
@TypeConverters(AttendanceStateConverters::class)
abstract class AttendanceDatabase : RoomDatabase() {
    abstract fun attendanceDao(): AttendanceDao

    companion object {
        @Volatile
        private var INSTANCE: AttendanceDatabase? = null

        private val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                // Old schema:
                // id, studentId, sessionCode, timestamp, latitude, longitude, wifiSsid, status(TEXT), synced(INTEGER)
                // New schema:
                // id, studentId, sessionCode, timestamp, latitude, longitude, wifiSsid, state(TEXT), failureReason(TEXT), synced(INTEGER)
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `attendance_new` (" +
                        "`id` TEXT NOT NULL, " +
                        "`studentId` TEXT NOT NULL, " +
                        "`sessionCode` TEXT NOT NULL, " +
                        "`timestamp` INTEGER NOT NULL, " +
                        "`latitude` REAL, " +
                        "`longitude` REAL, " +
                        "`wifiSsid` TEXT, " +
                        "`state` TEXT NOT NULL, " +
                        "`failureReason` TEXT, " +
                        "`synced` INTEGER NOT NULL, " +
                        "PRIMARY KEY(`id`)" +
                        ")"
                )

                // Best-effort mapping from previous free-text status.
                // Note: we can't reliably parse previous "FAILED: ..." pattern in SQL; we preserve the message in failureReason where possible.
                db.execSQL(
                    "INSERT INTO `attendance_new` (id, studentId, sessionCode, timestamp, latitude, longitude, wifiSsid, state, failureReason, synced) " +
                        "SELECT id, studentId, sessionCode, timestamp, latitude, longitude, wifiSsid, " +
                        "CASE " +
                        " WHEN status = 'PENDING_SERVER' THEN 'PENDING_LOCAL' " +
                        " WHEN status = 'QUEUED_OFFLINE' THEN 'PENDING_LOCAL' " +
                        " WHEN status LIKE 'FAILED:%' THEN 'FAILED' " +
                        " WHEN status LIKE 'REJECTED%' THEN 'REJECTED' " +
                        " ELSE 'PENDING_LOCAL' END as state, " +
                        "CASE " +
                        " WHEN status LIKE 'FAILED:%' THEN substr(status, 8) " +
                        " ELSE NULL END as failureReason, " +
                        "synced " +
                        "FROM `attendance`"
                )

                db.execSQL("DROP TABLE `attendance`")
                db.execSQL("ALTER TABLE `attendance_new` RENAME TO `attendance`")

                // Add unique index for local duplicate protection.
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS `index_attendance_studentId_sessionCode` ON `attendance` (`studentId`, `sessionCode`)")
            }
        }

        private val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                // Add backend response columns + sync metadata (nullable).
                db.execSQL("ALTER TABLE `attendance` ADD COLUMN `verificationStatus` TEXT")
                db.execSQL("ALTER TABLE `attendance` ADD COLUMN `flagReason` TEXT")
                db.execSQL("ALTER TABLE `attendance` ADD COLUMN `serverMessage` TEXT")
                db.execSQL("ALTER TABLE `attendance` ADD COLUMN `lastAttemptAt` INTEGER")
            }
        }

        fun getInstance(context: Context): AttendanceDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    AttendanceDatabase::class.java,
                    "attendance.db"
                )
                    .addMigrations(MIGRATION_1_2, MIGRATION_2_3)
                    .build()
                    .also { INSTANCE = it }
            }
        }
    }
}
