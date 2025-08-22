const formatCurrency = (value, currency = "usd") =>
  value >= 1
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(value)
    : new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: 8 }).format(value);

const formatPercentage = (value) => `${value.toFixed(2)}%`;

// CoinGecko API base and constants
const COINGECKO_API_BASE = "https://api.coingecko.com/api/v3";
const COIN_ID = "pepecoin-network";

let currencySelect = null;
let userCurrency = "usd";
let supportedCurrencies = ["usd"];
let currentPeriod = 1; // 1-7 for 1D-7D

async function fetchCoinData() {
  const url = `${COINGECKO_API_BASE}/coins/${COIN_ID}?localization=false&tickers=true&market_data=true&community_data=false&developer_data=false&sparkline=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch from CoinGecko");
  return await res.json();
}

function parseMarketsTable(tickers, currency) {
  return tickers.map(ticker => {
    // Clean the URL by removing any query string (everything after ?)
    let url = ticker.trade_url || "#";
    if (url.includes("?")) {
      url = url.split("?")[0];
    }
    return {
      exchange: ticker.market.name,
      logo: ticker.market.logo || "",
      pair: ticker.base + "/" + ticker.target,
      price: ticker.converted_last?.[currency] || ticker.last,
      volume24h: ticker.converted_volume?.[currency] || ticker.volume,
      url
    };
  });
}

// D3 CHARTS

function createBalanceChart(data) {
  const margin = { top: 20, right: 30, bottom: 30, left: 80 };
  const width = document.getElementById("balanceChart").clientWidth - margin.left - margin.right;
  const height = document.getElementById("balanceChart").clientHeight - margin.top - margin.bottom;
  d3.select("#balanceChart").selectAll("*").remove();

  const svg = d3
    .select("#balanceChart")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const defs = svg.append("defs");
  const filter = defs.append("filter").attr("id", "glow");
  filter.append("feGaussianBlur").attr("stdDeviation", "3.5").attr("result", "coloredBlur");
  const feMerge = filter.append("feMerge");
  feMerge.append("feMergeNode").attr("in", "coloredBlur");
  feMerge.append("feMergeNode").attr("in", "SourceGraphic");

  const x = d3.scaleTime().range([0, width]).domain(d3.extent(data, (d) => d.date));
  const y = d3.scaleLinear().range([height, 0]).domain([d3.min(data, (d) => d.value) * 0.98, d3.max(data, (d) => d.value) * 1.02]);

  const line = d3.line().x((d) => x(d.date)).y((d) => y(d.value)).curve(d3.curveMonotoneX);

  svg.append("path")
    .datum(data)
    .attr("fill", "none")
    .attr("stroke", "#16532A")
    .attr("stroke-width", 2)
    .attr("d", line)
    .style("filter", "url(#glow)");

  svg.selectAll(".dot")
    .data(data)
    .enter()
    .append("circle")
    .attr("class", "dot")
    .attr("cx", (d) => x(d.date))
    .attr("cy", (d) => y(d.value))
    .attr("r", 5)
    .style("fill", "#00ffbfff")
    .style("stroke", "#16532A")
    .style("stroke-width", 2)
    .style("filter", "url(#glow)");

  svg.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(d3.timeFormat("%b %d")))
    .selectAll("text")
    .style("fill", "#ffffff");

  svg.append("g")
    .call(d3.axisLeft(y).ticks(5).tickFormat((d) => formatCurrency(d, userCurrency)))
    .selectAll("text")
    .style("fill", "#ffffff");

  const tooltip = d3.select("#tooltip");
  const bisect = d3.bisector((d) => d.date).left;

  svg
    .append("rect")
    .attr("width", width)
    .attr("height", height)
    .style("fill", "none")
    .style("pointer-events", "all")
    .on("mousemove", function (event) {
      const [xPos] = d3.pointer(event, this);
      const x0 = x.invert(xPos);
      const i = bisect(data, x0, 1);
      const d0 = data[i - 1];
      const d1 = data[i];
      const d = !d1 ? d0 : x0 - d0.date > d1.date - x0 ? d1 : d0;

      tooltip
        .style("display", "block")
      .style("border-radius", "24px")
        .style("left", `${event.pageX + 10}px`)
        .style("top", `${event.pageY - 28}px`)
        .html(`Date: ${d3.timeFormat("%b %d, %Y")(d.date)}<br>Price: ${formatCurrency(d.value, userCurrency)}`);
    })
    .on("mouseout", () => tooltip.style("display", "none"));
}

function createBarChart(containerId, data, color, labelPrefix = "Volume") {
  const margin = { top: 20, right: 20, bottom: 30, left: 40 };
  const width = document.getElementById(containerId).clientWidth - margin.left - margin.right;
  const height = document.getElementById(containerId).clientHeight - margin.top - margin.bottom;

  d3.select(`#${containerId}`).selectAll("*").remove();

  const svg = d3
    .select(`#${containerId}`)
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand().range([0, width]).padding(0.1);
  const y = d3.scaleLinear().range([height, 0]);

  x.domain(data.map((d, i) => i));
  y.domain([0, d3.max(data)]);

  svg
    .selectAll(".bar")
    .data(data)
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("x", (d, i) => x(i))
    .attr("width", x.bandwidth())
    .attr("y", height)
    .attr("height", 0)
    .attr("fill", color)
    .attr("rx", 5)
    .attr("ry", 5)
    .transition()
    .duration(1000)
    .attr("y", (d) => y(d))
    .attr("height", (d) => height - y(d));

  svg
    .append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).tickFormat((d, i) => `T${i + 1}`))
    .selectAll("text")
    .style("fill", "#ffffff");

  svg
    .append("g")
    .call(d3.axisLeft(y).ticks(5).tickFormat((d) => formatCurrency(d, userCurrency)))
    .selectAll("text")
    .style("fill", "#ffffff");

  const tooltip = d3.select("#tooltip");
  svg
    .selectAll(".bar")
    .on("mousemove", function (event, d, i) {
      tooltip
        .style("display", "block")
      .style("border-radius", "24px")
        .style("left", `${event.pageX + 10}px`)
        .style("top", `${event.pageY - 28}px`)
        .html(`${labelPrefix}: ${formatCurrency(d, userCurrency)}`);
    })
    .on("mouseout", () => tooltip.style("display", "none"));
}

function calculateGreedIndex(data) {
  // 1. Price momentum
  const priceChange24h = data.market_data.price_change_percentage_24h || 0;
  const priceChange7d = data.market_data.price_change_percentage_7d || 0;

  // 2. Volume compared to market cap (as a proxy for "interest")
  const marketCap = data.market_data.market_cap?.usd || 1;
  const vol24h = data.market_data.total_volume?.usd || 0;
  const volumeCapRatio = Math.min(vol24h / marketCap, 1); // 0-1

  // 3. Volatility (standard deviation of sparkline)
  let volatility = 0;
  if (data.market_data.sparkline_7d?.price) {
    const prices = data.market_data.sparkline_7d.price;
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    volatility = Math.sqrt(prices.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / prices.length) / avg * 100;
  }

  // Normalize & weight, total to 100
  let greed = 50 + (priceChange7d + priceChange24h) * 0.5 + volumeCapRatio * 30 + volatility * 0.2;
  greed = Math.max(0, Math.min(100, greed));

  // For chart:
  let greedVal = Math.round(greed);
  let neutralVal = Math.max(0, 100 - greedVal - 10);
  let fearVal = 100 - greedVal - neutralVal;
  let change = priceChange24h; // use 24h price change as change indicator

  return {
    mainValue: greedVal,
    changeValue: change,
    components: [
      { label: "Greed", value: greedVal },
      { label: "Neutral", value: neutralVal },
      { label: "Fear", value: fearVal }
    ]
  };
}

function createGreedIndexChart(components, mainValue, changeValue) {
  // components: [{ label: 'Greed', value: ... }, ...] (should sum to 100)
  // mainValue: main number in center (e.g. greed index value)
  // changeValue: change (can be negative/positive)

  const width = document.getElementById("greedIndexChart").clientWidth;
  const height = document.getElementById("greedIndexChart").clientHeight;
  const radius = Math.min(width, height) / 2;

  d3.select("#greedIndexChart").selectAll("*").remove();

  const svg = d3
    .select("#greedIndexChart")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("transform", `translate(${width / 2},${height / 2})`);

  const color = d3
    .scaleOrdinal()
    .domain(components.map((d) => d.label))
    .range(["#16532A", "#57c290ff", "#b13535ff"]);

  const pie = d3.pie().value((d) => d.value).sort(null);
  const arc = d3.arc().innerRadius(radius * 0.6).outerRadius(radius);

  svg
    .selectAll(".arc")
    .data(pie(components))
    .enter()
    .append("g")
    .attr("class", "arc")
    .append("path")
    .attr("d", arc)
    .attr("fill", (d) => color(d.data.label))
    .style("stroke", "#fff")
    .style("stroke-width", "2px");

  svg
    .append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "-0.3em")
    .attr("class", "greed-index-text")
    .style("font-size", "24px")
    .style("font-weight", "bold")
    .style("fill", "#ffffff")
    .text(`${mainValue.toFixed(0)}%`);

  svg
    .append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "1.5em")
    .style("font-size", "14px")
    .style("fill", changeValue >= 0 ? "#4caf50" : "#ffffffff")
    .text(`${changeValue >= 0 ? "+" : ""}${formatPercentage(changeValue)}`);

  const tooltip = d3.select("#tooltip");
  svg.selectAll(".arc")
    .on("mousemove", function (event, d) {
      tooltip
        .style("display", "block")
      .style("border-radius", "24px")
        .style("left", `${event.pageX + 10}px`)
        .style("top", `${event.pageY - 28}px`)
        .html(`${d.data.label}: ${d.data.value}%`);
    })
    .on("mouseout", () => tooltip.style("display", "none"));
}

// DASHBOARD POPULATION

async function updateDashboardFromApi() {
  const data = await fetchCoinData();

  // -- Currency selector (populate and handle change) --
  // Always use USD
  userCurrency = "usd";
  supportedCurrencies = ["usd"];
  if (!currencySelect) currencySelect = document.getElementById("currency");
  if (currencySelect && currencySelect.children.length !== supportedCurrencies.length) {
    currencySelect.innerHTML = "";
    supportedCurrencies.forEach(cur => {
      const opt = document.createElement("option");
      opt.value = cur;
      opt.innerText = cur.toUpperCase();
      currencySelect.appendChild(opt);
    });
    currencySelect.value = userCurrency;
    currencySelect.onchange = () => {
      // Always revert to USD, ignore user selection
      userCurrency = "usd";
      currencySelect.value = "usd";
      updateDashboardFromApi();
    };
  }

  const priceObj = data.market_data.current_price;
  document.getElementById("todayVolume").textContent =
  formatCurrency(data.market_data.total_volume?.usd || 0, "usd").replace(/\.00$/, "");
  document.getElementById("currentPrice").textContent = formatCurrency(priceObj["usd"], "usd");

  // -- Markets Table --
  const marketsTableBody = document.getElementById("marketsTableBody");
  marketsTableBody.innerHTML = "";
  parseMarketsTable(data.tickers, "usd").forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.exchange}</td>
      <td><a href="${row.url}" target="_blank" class="text-indigo-400 underline">${row.pair}</a></td>
      <td>${formatCurrency(row.price, "usd")}</td>
      <td>$${row.volume24h?.toLocaleString() ?? ""}</td>
    `;
    marketsTableBody.appendChild(tr);
  });

  // -- Main chart: use sparkline 7d, trim to X days as per currentPeriod --
  let priceHistory = [];
  if (data.market_data.sparkline_7d?.price) {
    const now = new Date();
    const prices = data.market_data.sparkline_7d.price;
    // Last N days
    const hours = currentPeriod * 24;
    const offset = prices.length - hours;
    const slice = prices.slice(offset >= 0 ? offset : 0);
    priceHistory = slice.map((price, i) => ({
      date: new Date(now.getTime() - (slice.length - i - 1) * 3600 * 1000),
      value: price
    }));
    createBalanceChart(priceHistory);
  } else if (priceObj["usd"]) {
    createBalanceChart([{ date: new Date(), value: priceObj["usd"] }]);
  }

  createPriceChangeHeatmap(
    "salesChart",
    data.market_data.sparkline_7d?.price,
    data.market_data.current_price["usd"]
  );
  createTrustScoreChart("exchangeChart", data.tickers);

  // -- Greed Index (calculated from CoinGecko data) --
  const greed = calculateGreedIndex(data);
  document.getElementById("greedIndexValue").textContent = greed.mainValue;
  document.getElementById("greedIndexChange").textContent = `${greed.changeValue >= 0 ? "+" : ""}${formatPercentage(greed.changeValue)}`;
  createGreedIndexChart(greed.components, greed.mainValue, greed.changeValue);
}

function createPriceChangeHeatmap(containerId, sparkline, currentPrice) {
  const margin = { top: 20, right: 20, bottom: 30, left: 40 };
  const width = document.getElementById(containerId).clientWidth - margin.left - margin.right;
  const height = document.getElementById(containerId).clientHeight - margin.top - margin.bottom;
  d3.select(`#${containerId}`).selectAll("*").remove();

  // Calculate daily price change %
  const days = 7;
  let dailyChange = [];
  if (sparkline && sparkline.length > 0) {
    const perDay = Math.floor(sparkline.length / days);
    for (let i = 1; i < days + 1; i++) {
      const prev = sparkline[(i - 1) * perDay];
      const next = sparkline[i * perDay - 1] || sparkline[sparkline.length - 1];
      const change = ((next - prev) / prev) * 100;
      dailyChange.push({
        day: i,
        value: change,
        prev: prev,
        next: next
      });
    }
  }

  const svg = d3
    .select(`#${containerId}`)
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand().range([0, width]).padding(0.2).domain(d3.range(days));
  const y = d3.scaleLinear().range([height, 0]).domain([
    Math.min(0, d3.min(dailyChange, d => d.value)),
    Math.max(0, d3.max(dailyChange, d => d.value)),
  ]);

  // Tooltip div (ensure you have #tooltip in your HTML or create it dynamically)
  let tooltip = d3.select("#tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body").append("div")
      .attr("id", "tooltip")
      .attr("class", "tooltip");
  }

  svg
    .selectAll(".bar")
    .data(dailyChange)
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("x", (d, i) => x(i))
    .attr("width", x.bandwidth())
    .attr("y", (d) => (d.value >= 0 ? y(d.value) : y(0)))
    .attr("height", (d) => Math.abs(y(d.value) - y(0)))
    .attr("fill", (d) => (d.value >= 0 ? "#16532A" : "#b13535ff"))
    .on("mousemove", function (event, d) {
      tooltip
        .style("display", "block")
      .style("border-radius", "24px")
        .style("left", `${event.pageX + 10}px`)
        .style("top", `${event.pageY - 28}px`)
        .html(
          `<strong>Day ${d.day}</strong><br>
          Open: ${d.prev.toFixed(6)}<br>
          Close: ${d.next.toFixed(6)}<br>
          Change: <strong>${d.value.toFixed(2)}%</strong>`
        );
    })
    .on("mouseout", function () {
      tooltip.style("display", "none");
    });

  svg
    .append("g")
    .attr("transform", `translate(0,${y(0)})`)
    .call(d3.axisBottom(x).tickFormat((d, i) => `Day ${i + 1}`))
    .selectAll("text")
    .style("fill", "#fff");

  svg
    .append("g")
    .call(d3.axisLeft(y).ticks(5).tickFormat((d) => d.toFixed(1) + "%"))
    .selectAll("text")
    .style("fill", "#fff");
}

function createTrustScoreChart(containerId, tickers) {
  const TRUST_RANK = { green: 3, yellow: 2, red: 1 };
  const TRUST_LABEL = { 3: "Green", 2: "Yellow", 1: "Red" };
  const margin = { top: 20, right: 20, bottom: 30, left: 120 };
  const width = document.getElementById(containerId).clientWidth - margin.left - margin.right;
  const height = document.getElementById(containerId).clientHeight - margin.top - margin.bottom;
  d3.select(`#${containerId}`).selectAll("*").remove();

  // Tooltip div (one per chart)
  let tooltip = d3.select(`#${containerId}`).select(".tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select(`#${containerId}`)
      .append("div")
      .attr("class", "tooltip")
      .style("position", "absolute")
      .style("background", "rgba(40,40,40,0.98)")
      .style("color", "#fff")
      .style("padding", "10px 16px")
      .style("border-radius", "24px")
      .style("pointer-events", "none")
      .style("font-size", "14px")
      .style("box-shadow", "0 4px 16px rgba(0,0,0,0.18)")
      .style("z-index", 10)
      .style("display", "none");
  }

  // Prepare exchanges by trust score
  const exchanges = tickers
    .map(t => ({
      ...t,
      trustScoreValue: TRUST_RANK[t.trust_score] || 0,
    }))
    .filter(t => t.trustScoreValue > 0)
    .sort((a, b) => {
      if (b.trustScoreValue !== a.trustScoreValue) {
        return b.trustScoreValue - a.trustScoreValue;
      }
      // If same trust score, sort by volume
      return (b.converted_volume?.usd ?? 0) - (a.converted_volume?.usd ?? 0);
    })
    .slice(0, 7);

  if (exchanges.length === 0) {
    d3.select(`#${containerId}`)
      .append("div")
      .style("color", "#fff")
      .style("padding", "24px")
      .text("No exchanges with trust score available.");
    return;
  }

  const svg = d3
    .select(`#${containerId}`)
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const y = d3
    .scaleBand()
    .range([0, height])
    .domain(exchanges.map((d) => d.market.name))
    .padding(0.2);

  const x = d3
    .scaleLinear()
    .range([0, width])
    .domain([0, 3]); // Trust score goes from 1 to 3

  const colorMap = { 3: "#22c55e", 2: "#eab308", 1: "#ef4444" };

  // Bars with tooltip
  svg
    .selectAll(".bar")
    .data(exchanges)
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("y", (d) => y(d.market.name))
    .attr("height", y.bandwidth())
    .attr("x", 0)
    .attr("width", (d) => x(d.trustScoreValue))
    .attr("fill", (d) => colorMap[d.trustScoreValue] || "#888")
    .on("mousemove", function(event, d) {
      tooltip
        .style("display", "block")
      .style("border-radius", "24px")
        .html(
          `<strong>${d.market.name}</strong><br>
          Trust Score: <span style="color:${colorMap[d.trustScoreValue]}">${TRUST_LABEL[d.trustScoreValue]}</span><br>
          Volume: $${d3.format(",.0f")(d.converted_volume?.usd ?? 0)}`
        )
        .style("left", (event.offsetX + margin.left + 30) + "px")
        .style("top", (event.offsetY + margin.top - 10) + "px");
    })
    .on("mouseleave", function() {
      tooltip.style("display", "none");
    });

  svg
    .append("g")
    .call(d3.axisLeft(y))
    .selectAll("text")
    .style("fill", "#fff");

  svg
    .append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(3).tickFormat(d => {
      if (d === 3) return "Green";
      if (d === 2) return "Yellow";
      if (d === 1) return "Red";
      return "";
    }))
    .selectAll("text")
    .style("fill", "#fff");
}

// FIRST LOAD: always use USD, then update dashboard
async function firstLoad() {
  d3.select("body").append("div").attr("id", "tooltip").attr("class", "tooltip");
  userCurrency = "usd";
  supportedCurrencies = ["usd"];
  if (!currencySelect) currencySelect = document.getElementById("currency");
  if (currencySelect) currencySelect.value = userCurrency;
  updateDashboardFromApi();
}

document.addEventListener("DOMContentLoaded", firstLoad);

// Only refresh graphs on time period click, use 1D-7D filters
document.querySelectorAll(".time-btn").forEach((btn, idx) => {
  btn.addEventListener("click", function () {
    document.querySelector(".time-btn.active")?.classList.remove("active");
    btn.classList.add("active");
    currentPeriod = parseInt(btn.dataset.period); // e.g. 1, 2, ... 7
    updateDashboardFromApi();
  });
});

// Navigation: only dashboard triggers updateDashboardFromApi
document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", function (e) {
    e.preventDefault();
    document.querySelector(".nav-link.active").classList.remove("active");
    this.classList.add("active");
    const targetPage = this.dataset.page;
    document.querySelectorAll(".page-content").forEach((page) => {
      page.classList.add("hidden");
    });
    document.getElementById(`${targetPage}-page`).classList.remove("hidden");
    if (targetPage === "dashboard") updateDashboardFromApi();
  });
});

window.addEventListener("resize", updateDashboardFromApi);

const wallets = [
  {
    name: "Tangem",
    url: "https://tangem.com/pricing/?promocode=PEPECOINNEWS&_from=pepecoinnews.com",
    logo: "https://pepecoinnews.com/wp-content/uploads/2025/05/tangem-logo.webp",
    features: ["HW Wallet", "Seedphrase", "Seedless"],
    platforms: ["Android", "iOS"]
  },
  {
    name: "Coinomi",
    url: "https://www.coinomi.com/en/downloads/",
    logo: "https://pepecoinnews.com/wp-content/uploads/2025/07/coinomi-logo.webp",
    features: ["HD Wallet", "Seedphrase"],
    platforms: ["Windows", "MacOs", "Linux", "Android", "iOS"]
  },
  {
    name: "MyPepe",
    url: "https://chromewebstore.google.com/detail/mypepe-pepecoin-wallet/fmefeapbjedgldpgeeineplkgbpdjaem",
    logo: "https://pepecoinnews.com/wp-content/uploads/2025/06/pepecoin-logo.webp",
    features: ["Seedphrase", "Open Source"],
    platforms: ["WEB"]
  },
  {
    name: "Scrypt Wallet",
    url: "https://app.scryptwallet.io/",
    logo: "https://pepecoinnews.com/wp-content/uploads/2025/06/pepecoin-logo.webp",
    features: ["Private Key"],
    platforms: ["WEB"]
  },
  {
    name: "Plugz Wallet",
    url: "https://blockchainplugz.com/wallet",
    logo: "https://pepecoinnews.com/wp-content/uploads/2025/06/pepecoin-logo.webp",
    features: ["Private Key"],
    platforms: ["WEB"]
  },
  {
    name: "Komodo Wallet",
    url: "https://komodoplatform.com/en/wallet/",
    logo: "https://pepecoinnews.com/wp-content/uploads/2025/07/komodo.webp",
    features: ["Open Source", "Seedphrase"],
    platforms: ["Windows", "MacOs", "Linux", "Android", "iOS", "WEB"]
  },
  {
    name: "Onchain Wallet",
    url: "https://github.com/mrtnetwork/mrtwallet",
    logo: "https://pepecoinnews.com/wp-content/uploads/2025/02/OnChain-Wallet-logo.png",
    features: ["HD Wallet", "Open Source", "Seedphrase"],
    platforms: ["Windows", "Android", "WEB"]
  },
  {
    name: "Pepecoin Core",
    url: "https://github.com/pepecoinppc/pepecoin/releases",
    logo: "https://pepecoinnews.com/wp-content/uploads/2025/06/pepecoin-logo.webp",
    features: ["Open Source", "Full node", "HD Wallet"],
    platforms: ["Windows", "MacOs", "Linux"]
  }
];

function renderWalletList() {
  const assetList = document.getElementById("assetList");
  if (!assetList) return;
  assetList.innerHTML = "";

  wallets.forEach(wallet => {
    // Create <li>
    const li = document.createElement("li");
    li.className = "flex items-center space-x-4 p-3 bg-white bg-opacity-10 rounded-lg shadow min-h-[88px] h-full transition hover:bg-opacity-20";

    // Create <a> inside <li>
    const a = document.createElement("a");
    a.href = wallet.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "flex items-center w-full h-full group no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-lg";

    // Logo
    const logo = document.createElement("img");
    logo.src = wallet.logo;
    logo.alt = wallet.name;
    logo.className = "w-10 h-10 rounded";

    // Info
    const infoDiv = document.createElement("div");
    infoDiv.className = "flex-1";

    const name = document.createElement("span");
    name.className = "font-semibold text-lg text-indigo-300 group-hover:underline";
    name.textContent = wallet.name;

    infoDiv.appendChild(name);

    a.appendChild(logo);
    a.appendChild(infoDiv);
    li.appendChild(a);

    // Optional, for consistent sizing
    li.style.minHeight = "88px";
    li.style.height = "100%";
    logo.style.marginRight = "20px";

    assetList.appendChild(li);
  });

  // Auto equalize heights (if needed)
  const lis = assetList.querySelectorAll("li");
  let maxHeight = 0;
  lis.forEach(li => {
    li.style.height = "auto";
    if (li.offsetHeight > maxHeight) maxHeight = li.offsetHeight;
  });
  lis.forEach(li => li.style.height = maxHeight + "px");
}

document.addEventListener("DOMContentLoaded", () => {
  renderWalletList();
});

console.log("Crypto dashboard script loaded successfully");