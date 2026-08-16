# PatwaLink — reglas de ofuscación para la variante de release.
#
# La superficie es mínima a propósito: una sola Activity, sin puente
# JavaScript, sin reflexión y sin serialización. Casi todo lo que hace
# falta ya viene de proguard-android-optimize.txt y de las reglas que
# publican las propias bibliotecas de AndroidX.

# La Activity la instancia el sistema por nombre desde el manifiesto.
-keep class com.patwalink.app.MainActivity { *; }

# No hay @JavascriptInterface en esta app, y no debe haberlo: el WebView
# se carga sin puente. La regla queda como red de seguridad por si
# alguien lo añadiera sin recordar que R8 le borraría los métodos.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Traza legible en los informes de fallo sin renunciar a la ofuscación.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
