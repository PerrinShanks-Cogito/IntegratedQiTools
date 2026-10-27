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

  var SDK_URL = "https://js.monitor.azure.com/scripts/b/ai.3.gbl.min.js";

  // Tool name: data-tool attribute, otherwise the file name (e.g. "run-chart.html" -> "run-chart")
  var thisScript = document.currentScript;
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
  s.async = true;
  s.crossOrigin = "anonymous";
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
