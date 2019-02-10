let akStatusCache = {};

let cnameCache = {};

let iconPath = {
    blue: "icons/blue.ico",
    green: "icons/green.ico",
    gray: "icons/gray.ico"
}

let info = i = {
    akCnameSuffixes: [
        ".akamaiedge.net.",
        ".edgekey.net.",
        ".edgesuite.net."
    ],
    akCookieNames: [],
    akCookieNamePrefixes: [
        "akacd"
    ],
    akHeaderNames: [
        "x-akamai-pragma-client-ip",
        "x-akamai-request-id",
        "x-akamai-session-info",
        "x-akamai-ssl-client-id",
        "x-akamai-staging",
        "x-akamai-transformed",
    ],
    akPragmaValues: [
        "akamai-get-request-id",
        "akamai-x-status-on",
        "akamai-x-status-remote-on",
        "akamai-x-check-statusable",
        "akamai-x-feo-trace",
        "akamai-x-get-status-key",
        "akamai-x-get-client-ip",
        "akamai-x-get-extracted-values",
        "akamai-x-get-nonces",
        "akamai-x-get-ssl-client-session-id",
        "akamai-x-get-true-status-key",
        "akamai-x-serial-no"
    ],
    akServerValues: [
        "akamaighost",
        "netstorage"
    ]
}

let interceptFilter = {
    types: ["main_frame"],
    urls: ["*://*/*"]
}

function addPragmaHeader(request) {
    let pragmaExists = false;
    for (let header of request.requestHeaders) {
        if (header.name.toLowerCase() == "pragma") {
            currentVals = header.value.split(", ");
            for (let val of i.akPragmaValues) {
                if (!current_vals.includes(val)) {
                    header.value.concat(", ", val);
                }
            }
            pragmaExists = true;
            break;
        }
    }
    if (!pragmaExists) {
        request.requestHeaders.push({
            name: "Pragma",
            value: i.akPragmaValues.join(", ")
        });
    }
    return {requestHeaders: request.requestHeaders};
}

async function akCname(host) {
    let akCname = null;
    let cnames = await cnameChain(host);
    for (let cname of cnames) {
        for (let suffix of i.akCnameSuffixes) {
            if (cname.endsWith(suffix)) {
                akCname = cname;
            }
        }
    }
    return akCname;
}

function akCookieDetected(responseHeaders) {
    let names = cookieNames(responseHeaders);
    let nameMatches = akCookieNameMatches(names);
    let prefixMatches = akCookieNamePrefixMatches(names);
    if (nameMatches.length > 0 || prefixMatches.length > 0) {
        return true;
    } else {
        return false;
    }
}

function akCookieNameMatches(cookieNames) {
    matches = [];
    for (let name of cookieNames) {
        if (i.akCookieNames.includes(name)) {
            matches.push(name);
        }
    }
    return matches;
}

function akCookieNamePrefixMatches(cookieNames) {
    matches = [];
    for (let name of cookieNames) {
        for (let prefix of i.akCookieNamePrefixes) {
            if (name.startsWith(prefix)) {
                matches.push(prefix);
            }
        }
    }
    return matches;
}

function akHeaderDetected(responseHeaders) {
    for (let header of responseHeaders) {
        let name = header.name.toLowerCase();
        let value = header.value.toLowerCase();
        if (i.akHeaderNames.includes(name) || i.akServerValues.includes(value)) {
            return true;
        }
    }
    return false;
}

function akStagingHeaderDetected(responseHeaders) {
    for (let header of responseHeaders) {
        if (header.name.toLowerCase() == "x-akamai-staging") {
            return true;
        }
    }
    return false;
}

async function akStatusFromDns(host, ip) {
    let status = null;
    let cname = await akCname(host);
    if (!cname) {
        return status;
    }
    let dnsResponse = await browser.dns.resolve(cname);
    let ips = dnsResponse.addresses;
    if (ips.includes(ip)) {
        status = "production";
    }
    return status;
}

function akStatusFromResponseHeaders(responseHeaders) {
    let status = null;
    if (akHeaderDetected(responseHeaders) || akCookieDetected(responseHeaders)) {
        if (akStagingHeaderDetected(responseHeaders)) {
            status = "staging";
        } else {
            status = "production";
        }
    }
    return status;
}

function clearStatus() {
    let querying = browser.tabs.query({currentWindow: true, active: true});
    querying.then((tabs) => {
        let tab = tabs[0];
        let id = tab.id;
        let host = hostFromUrl(tab.url);
        if (host) {
            delete akStatusCache[host];
            delete cnameCache[host];
            let reloading = browser.tabs.reload(id, {
                bypassCache: true
            });
            reloading.then(() => {
                updateIcon();
            });
        }
    });
}

async function cnameChain(host) {
    let chain = cnameCache[host];
    if (chain) {
        return chain;
    }
    chain = [];
    let urlBase = "https://cloudflare-dns.com/dns-query?name=";
    let url = urlBase.concat(host)
    let response = await fetch(url, {
        headers: {
            "accept": "application/dns-json"
        }
    });
    let data = await response.json();
    for (let answer of data.Answer) {
        if (answer.type == 5) {
            chain.push(answer.data);
        }
    }
    cnameCache[host] = chain;
    return chain;
}

function cookieNames(responseHeaders) {
    let names = [];
    for (let header of responseHeaders) {
        if (header.name.toLowerCase() == "set-cookie") {
            let cookies = header.value.split("\n");
            for (let cookie of cookies) {
                names.push(cookie.split("=")[0]);
            }
        }
    }
    return names;
}

async function detectAkamai(response) {
    let host = hostFromUrl(response.url);
    let status = akStatusFromResponseHeaders(response.responseHeaders);
    if (!status) {
        status = await akStatusFromDns(host, response.ip);
        if (!status) {
            return;
        }
    }
    akStatusCache[host] = status;
    updateIcon();
}

function hostFromUrl(url) {
    let a = document.createElement("a");
    a.href = url;
    let host = a.hostname;
    return host;
}

function updateIcon() {
    let querying = browser.tabs.query({currentWindow: true, active: true});
    querying.then((tabs) => {
        let tab = tabs[0];
        let host = hostFromUrl(tab.url);
        status = akStatusCache[host];
        let color = "gray";
        if (status == "production") {
            color = "blue";
        } else if (status == "staging") {
            color = "green";
        }
        browser.browserAction.setIcon({
            path: iconPath[color]
        });
    });
}

browser.webRequest.onBeforeSendHeaders.addListener(
    addPragmaHeader,
    interceptFilter,
    ["blocking", "requestHeaders"]
);

browser.webRequest.onResponseStarted.addListener(
    detectAkamai,
    interceptFilter,
    ["responseHeaders"]
)

browser.browserAction.onClicked.addListener(clearStatus);
browser.tabs.onUpdated.addListener(updateIcon);
browser.windows.onFocusChanged.addListener(updateIcon);
