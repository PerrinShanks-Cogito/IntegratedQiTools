/* © Guy’s and St Thomas’ NHS Foundation Trust 2026. All rights reserved. */

/* Sends an old tool address on to where the tool lives now, keeping any #hash.
   The page gives the new address in the script tag's data-to attribute. */
(function () {
  "use strict";
  var to = document.currentScript && document.currentScript.getAttribute("data-to");
  if (to) location.replace(to + location.hash);
})();
