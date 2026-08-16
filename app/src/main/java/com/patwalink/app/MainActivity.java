package com.patwalink.app;

import android.annotation.SuppressLint;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewFeature;

/**
 * Contenedor WebView de PatwaLink.
 *
 * <p>La aplicación entera es un único HTML en {@code assets}. No hay red,
 * no hay permisos y no hay puente JavaScript hacia Java: la superficie de
 * ataque se reduce a lo que el propio WebView expone.
 *
 * <p>Se usa {@link WebViewAssetLoader} en lugar de {@code file://} porque
 * este último obliga a habilitar el acceso a ficheros locales, que es
 * justo lo que conviene evitar. El cargador sirve los assets bajo un
 * origen HTTPS sintético, con lo que la página queda en un origen seguro
 * sin que exista tráfico real.
 */
public final class MainActivity extends AppCompatActivity {

    /** Dominio sintético reservado por WebViewAssetLoader para assets locales. */
    private static final String DOMINIO = "appassets.androidplatform.net";

    /** Punto de entrada de la app web. */
    private static final String INICIO = "https://" + DOMINIO + "/assets/index.html";

    @Nullable
    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")   // el motor de traducción es JS
    @Override
    protected void onCreate(@Nullable Bundle estado) {
        super.onCreate(estado);

        try {
            web = new WebView(this);
        } catch (Exception | LinkageError e) {
            /* Hay dispositivos sin WebView instalado, con el paquete
               deshabilitado o a medio actualizar. Sin esto la app se cierra
               con un fallo que el usuario no puede interpretar. */
            mostrarAviso();
            return;
        }

        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(web);

        configurar(web.getSettings());
        web.setWebViewClient(new ClienteLocal(construirCargador()));

        registrarVueltaAtras();

        if (estado != null) {
            web.restoreState(estado);
        } else {
            web.loadUrl(INICIO);
        }
    }

    /** Cargador que sirve {@code src/main/assets} bajo el dominio sintético. */
    private WebViewAssetLoader construirCargador() {
        return new WebViewAssetLoader.Builder()
                .setDomain(DOMINIO)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
    }

    /**
     * Ajustes del WebView. Todo lo que no hace falta queda desactivado:
     * la app no lee ficheros, no abre ventanas y no accede a la red.
     */
    private void configurar(@NonNull WebSettings s) {
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);

        s.setAllowFileAccess(false);           // todo va por el cargador de assets
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setGeolocationEnabled(false);
        s.setSaveFormData(false);

        s.setTextZoom(100);                    // respetar el diseño, no el zoom del sistema
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);   // el HTML viaja en el APK

        /* NO se permite el oscurecimiento algorítmico, y es una decisión de
           diseño, no un olvido.

           PatwaLink es un cartel serigrafiado: papel crema, tinta casi
           negra, sombras duras desplazadas y brillo de plástico caramelo.
           La hoja de estilo no declara `prefers-color-scheme` en ninguna
           parte porque el diseño se compromete con un solo mundo visual.
           Dejar que el WebView invierta esos colores por su cuenta no
           produce un «modo oscuro»: produce el mismo cartel pasado por un
           filtro que apaga el turquesa, ensucia el crema y deja las sombras
           duras sin sentido.

           Se desactiva de forma explícita en lugar de confiar en el valor
           por omisión, para que quede constancia de que se consideró. */
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(s, false);
        }
    }

    /** Botón «atrás»: navega dentro de la app y sale cuando ya no hay historial. */
    private void registrarVueltaAtras() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (web != null && web.canGoBack()) {
                    web.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });
    }

    /** Pantalla de cortesía cuando el dispositivo no tiene WebView utilizable. */
    private void mostrarAviso() {
        TextView aviso = new TextView(this);
        aviso.setText(R.string.sin_webview);
        aviso.setPadding(64, 64, 64, 64);
        setContentView(aviso);
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle fuera) {
        super.onSaveInstanceState(fuera);
        if (web != null) web.saveState(fuera);   // conservar la traducción al girar
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        /* Desmontar el WebView antes de destruirlo: dejarlo colgando de la
           jerarquía de vistas filtra la Activity entera. */
        if (web != null) {
            ViewGroup padre = (ViewGroup) web.getParent();
            if (padre != null) padre.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /**
     * Cliente que sirve los assets y encierra la navegación en ellos.
     * Cualquier destino fuera del dominio sintético se descarta: la app no
     * tiene permiso de red y abrir un enlace externo dentro del WebView
     * daría un error sin explicación.
     */
    private static final class ClienteLocal extends WebViewClient {

        private final WebViewAssetLoader cargador;

        ClienteLocal(@NonNull WebViewAssetLoader cargador) {
            this.cargador = cargador;
        }

        @Override
        @Nullable
        public WebResourceResponse shouldInterceptRequest(
                @NonNull WebView vista, @NonNull WebResourceRequest peticion) {
            return cargador.shouldInterceptRequest(peticion.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(
                @NonNull WebView vista, @NonNull WebResourceRequest peticion) {
            return !DOMINIO.equals(peticion.getUrl().getHost());
        }

        /**
         * El renderizador puede morir por falta de memoria. Devolver
         * {@code true} le dice al sistema que la app se hace cargo, en vez
         * de matar el proceso entero con un fallo que el usuario ve como un
         * cierre inesperado. La retrollamada existe desde Android 8.
         */
        @Override
        @RequiresApi(api = Build.VERSION_CODES.O)
        public boolean onRenderProcessGone(@NonNull WebView vista,
                                           @NonNull RenderProcessGoneDetail detalle) {
            ViewGroup padre = (ViewGroup) vista.getParent();
            if (padre != null) padre.removeView(vista);
            vista.destroy();
            return true;
        }
    }
}
