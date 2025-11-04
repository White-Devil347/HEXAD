package com.hexad.studentapp

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.hexad.studentapp.ui.theme.HEXADStudentTheme
import androidx.fragment.app.FragmentActivity

class MainActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            HEXADStudentTheme {
                Surface(color = MaterialTheme.colorScheme.background) {
                    val authVm: SimpleAuthViewModel = viewModel()
                    AppNavHost(authVm)
                }
            }
        }
    }
}

@Composable
private fun AppNavHost(authVm: SimpleAuthViewModel, navController: NavHostController = rememberNavController()) {
    NavHost(navController = navController, startDestination = "login") {
        composable("login") {
            LoginScreen(
                vm = authVm,
                onRegisterClick = { navController.navigate("register") },
                onLoginSuccess = { navController.navigate("home") }
            )
        }
        composable("register") {
            RegisterScreen(
                vm = authVm,
                onRegisterSuccess = { navController.popBackStack(); navController.navigate("login") },
                onBack = { navController.popBackStack() }
            )
        }
        composable("home") {
            HomeScreen(onLogout = { navController.popBackStack(route = "login", inclusive = false) })
        }
    }
}