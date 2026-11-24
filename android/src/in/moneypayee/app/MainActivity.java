package in.moneypayee.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

public final class MainActivity extends Activity {
    private static final String HOME = "https://www.moneypayee.in/";
    private static final int PICK_FILE = 1;
    private static final int BACKGROUND = Color.rgb(8, 23, 14);
    private WebView web;
    private ProgressBar loading;
    private LinearLayout offline;
    private TextView offlineTitle;
    private String failedUrl;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
        }
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BACKGROUND);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars()
                    | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });

        web = new WebView(this);
        web.setBackgroundColor(BACKGROUND);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        configureWebView();

        loading = new ProgressBar(this);
        root.addView(loading, new FrameLayout.LayoutParams(dp(40), dp(40), Gravity.CENTER));
        offline = createOfflinePanel();
        root.addView(offline, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBack);
        }
        String interruptedUrl = state == null ? null : state.getString("failedUrl");
        if (state == null || web.restoreState(state) == null) {
            load(interruptedUrl == null ? HOME : interruptedUrl);
        } else if (interruptedUrl != null) {
            showUnavailable(interruptedUrl);
        }
    }

    private void configureWebView() {
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (isSite(url)) return false;
                if (!request.isForMainFrame() && "https".equals(url.getScheme())) return false;
                String scheme = url.getScheme();
                if ("https".equals(scheme) || "mailto".equals(scheme)
                    || "tel".equals(scheme) || "upi".equals(scheme)) openExternal(url);
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                failedUrl = null;
                offline.setVisibility(View.GONE);
                web.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
                loading.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                loading.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showUnavailable(request.getUrl().toString());
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse error) {
                if (request.isForMainFrame() && error.getStatusCode() >= 500) {
                    showUnavailable(request.getUrl().toString());
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), PICK_FILE);
                } catch (ActivityNotFoundException error) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                }
                return true;
            }
        });
    }

    private LinearLayout createOfflinePanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setPadding(dp(24), dp(20), dp(24), dp(20));
        panel.setBackgroundColor(BACKGROUND);
        panel.setVisibility(View.GONE);

        ImageView mark = new ImageView(this);
        mark.setImageResource(R.drawable.moneypayee_mark);
        panel.addView(mark, new LinearLayout.LayoutParams(dp(80), dp(80)));

        offlineTitle = new TextView(this);
        offlineTitle.setTextColor(Color.WHITE);
        offlineTitle.setTextSize(24);
        offlineTitle.setGravity(Gravity.CENTER);
        panel.addView(offlineTitle);

        TextView message = new TextView(this);
        message.setText("Check your connection and try again. Applications and payments require internet access.");
        message.setGravity(Gravity.CENTER);
        message.setTextColor(0xffc8ddca);
        message.setTextSize(15);
        message.setPadding(0, dp(12), 0, dp(16));
        panel.addView(message);

        Button retry = new Button(this);
        retry.setText("Retry");
        retry.setOnClickListener(view -> load(failedUrl == null ? HOME : failedUrl));
        panel.addView(retry);
        return panel;
    }

    private boolean isConnected() {
        ConnectivityManager manager = getSystemService(ConnectivityManager.class);
        return manager.getActiveNetwork() != null;
    }

    private void load(String url) {
        if (isConnected()) {
            failedUrl = null;
            offline.setVisibility(View.GONE);
            web.loadUrl(url);
        } else {
            showUnavailable(url);
        }
    }

    private void showUnavailable(String url) {
        failedUrl = url;
        loading.setVisibility(View.GONE);
        web.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        offlineTitle.setText(isConnected() ? "MoneyPayee is unavailable" : "You’re offline");
        offline.setVisibility(View.VISIBLE);
    }

    private static boolean isSite(Uri uri) {
        return "https".equals(uri.getScheme())
            && (uri.getPort() == -1 || uri.getPort() == 443)
            && ("www.moneypayee.in".equals(uri.getHost()) || "moneypayee.in".equals(uri.getHost()));
    }

    private void openExternal(Uri url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, url));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "No app is available to open this link.", Toast.LENGTH_SHORT).show();
        }
    }

    private void goBack() {
        if (web.canGoBack()) {
            failedUrl = null;
            offline.setVisibility(View.GONE);
            web.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
            web.goBack();
        } else {
            finish();
        }
    }

    @Override
    public void onBackPressed() {
        goBack();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
        outState.putString("failedUrl", failedUrl);
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILE && fileCallback != null) {
            ValueCallback<Uri[]> callback = fileCallback;
            fileCallback = null;
            callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
