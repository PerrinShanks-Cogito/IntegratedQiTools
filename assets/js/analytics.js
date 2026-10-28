/*
 * ImprovementTools – shared usage analytics
 * Sends anonymous usage telemetry to Azure Application Insights (integrated_qi_apps, UK South).
 *
 * Privacy design:
 *  - No cookies, no localStorage/sessionStorage  -> no consent banner needed under PECR
 *  - No click auto-capture, no AJAX/fetch capture -> pasted data is never collected
 *  - Query strings and #hashes are stripped from URLs before sending
 *  - Only send counts/settings via trackToolEvent – NEVER data values or labels
 *
 * Location: assets/js/analytics.js
 *
 * Include in each tool (before </body>):
 *   <script src="/assets/js/analytics.js" data-tool="run-chart"></script>
 *
 * (Root path works on the Azure site at any folder depth. If the tools use
 *  relative paths for other assets/js files, use e.g. ../assets/js/analytics.js)
 *
 * Then log meaningful actions anywhere in the tool's code:
 *   trackToolEvent("chart_generated", { points: 24 });
 */
(function () {
  "use strict";

  // Connection string for integrated_qi_apps (UK South). Safe to be public – it only allows sending data.
  var CONNECTION_STRING = "InstrumentationKey=9212284d-189d-48f7-8312-e5de867f1e30;IngestionEndpoint=https://uksouth-1.in.applicationinsights.azure.com/;LiveEndpoint=https://uksouth.livediagnostics.monitor.azure.com/;ApplicationId=1aab6fe8-11f1-4331-97ff-b03a03111d72";

  // The Application Insights SDK is served from this site, pinned to one version,
  // rather than from Microsoft's CDN, so a change on the CDN can't run code on
  // pages that hold pasted data. The file is Microsoft's own, unchanged: its
  // hash is the one in ai.3.4.5.integrity.json in the npm package
  // @microsoft/applicationinsights-web@3.4.5 (browser/es5). To update, copy the
  // new browser/es5/ai.<version>.gbl.min.js into assets/js/vendor and change
  // the file name and hash here.
  var thisScript = document.currentScript;
  var SDK_URL = new URL("vendor/ai.3.4.5.gbl.min.js", thisScript ? thisScript.src : location.origin + "/assets/js/").href;
  var SDK_INTEGRITY = "sha384-aTKCfGVKAFg+If03Hanf/RLpTadzuv1kyXFITdZe/xx2AW3KxVHNVKRTjUz40hVh";

  // Tool name: data-tool attribute, otherwise the file name (e.g. "run-chart.html" -> "run-chart")
  var tool =
    (thisScript && thisScript.getAttribute("data-tool")) ||
    location.pathname.split("/").pop().replace(/\.html?$/i, "") ||
    "home";

  var ai = null;
  var queue = [];

  function cleanUrl(u) {
    return typeof u === "string" ? u.split(/[?#]/)[0] : u;
  }

  // Public helper – safe to call before the SDK has loaded (events are queued),
  // and harmless if the SDK is blocked (events are simply dropped).
  window.trackToolEvent = function (name, props) {
    var p = { tool: tool };
    if (props) {
      for (var k in props) {
        if (Object.prototype.hasOwnProperty.call(props, k)) p[k] = props[k];
      }
    }
    if (ai) {
      ai.trackEvent({ name: name }, p);
    } else if (queue.length < 50) {
      queue.push([name, p]);
    }
  };

  var s = document.createElement("script");
  s.src = SDK_URL;
  s.integrity = SDK_INTEGRITY;
  s.async = true;
  s.onload = function () {
    try {
      ai = new Microsoft.ApplicationInsights.ApplicationInsights({
        config: {
          connectionString: CONNECTION_STRING,
          disableCookiesUsage: true,      // no ai_user / ai_session cookies
          isStorageUseDisabled: true,     // no local/session storage either
          disableAjaxTracking: true,      // don't capture XHR calls
          disableFetchTracking: true,     // don't capture fetch calls
          enableAutoRouteTracking: false,
          disableExceptionTracking: false, // keep: tells you when a tool breaks
          // Chrome blocks the "unload" event and logs a permissions policy
          // violation when the SDK listens for it; it still sends queued
          // events on "beforeunload" and "pagehide"
          disablePageUnloadEvents: ["unload"]
        }
      });
      ai.loadAppInsights();

      // Tag every item with the tool name and strip query strings / hashes
      ai.addTelemetryInitializer(function (item) {
        item.data = item.data || {};
        item.data.tool = tool;
        if (item.baseData) {
          if (item.baseData.uri) item.baseData.uri = cleanUrl(item.baseData.uri);
          if (item.baseData.refUri) item.baseData.refUri = cleanUrl(item.baseData.refUri);
        }
        return true;
      });

      ai.trackPageView({ name: tool, uri: cleanUrl(location.href) });

      for (var i = 0; i < queue.length; i++) {
        ai.trackEvent({ name: queue[i][0] }, queue[i][1]);
      }
      queue = [];
    } catch (e) {
      // Analytics must never break a tool
    }
  };
  document.head.appendChild(s);
})();
