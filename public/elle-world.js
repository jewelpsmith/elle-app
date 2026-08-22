class ElleWorld extends HTMLElement {
  constructor() {
    super();

    this.attachShadow({ mode: "open" });

    this.countries = [];
    this.worldFeatures = [];
    this.sessionId = "";
    this.rotation = [20, -12, 0];
    this.frame = null;
    this.lastFrame = performance.now();
    this.globeReady = false;
    this.destroyed = false;

    this.heartbeatTimer = null;
    this.refreshTimer = null;

    this.numericByAlpha2 = {
      AF:"004", AL:"008", DZ:"012", AS:"016", AD:"020", AO:"024",
      AI:"660", AQ:"010", AG:"028", AR:"032", AM:"051", AW:"533",
      AU:"036", AT:"040", AZ:"031", BS:"044", BH:"048", BD:"050",
      BB:"052", BY:"112", BE:"056", BZ:"084", BJ:"204", BM:"060",
      BT:"064", BO:"068", BQ:"535", BA:"070", BW:"072", BV:"074",
      BR:"076", IO:"086", BN:"096", BG:"100", BF:"854", BI:"108",
      CV:"132", KH:"116", CM:"120", CA:"124", KY:"136", CF:"140",
      TD:"148", CL:"152", CN:"156", CX:"162", CC:"166", CO:"170",
      KM:"174", CG:"178", CD:"180", CK:"184", CR:"188", CI:"384",
      HR:"191", CU:"192", CW:"531", CY:"196", CZ:"203", DK:"208",
      DJ:"262", DM:"212", DO:"214", EC:"218", EG:"818", SV:"222",
      GQ:"226", ER:"232", EE:"233", SZ:"748", ET:"231", FK:"238",
      FO:"234", FJ:"242", FI:"246", FR:"250", GF:"254", PF:"258",
      TF:"260", GA:"266", GM:"270", GE:"268", DE:"276", GH:"288",
      GI:"292", GR:"300", GL:"304", GD:"308", GP:"312", GU:"316",
      GT:"320", GG:"831", GN:"324", GW:"624", GY:"328", HT:"332",
      HM:"334", VA:"336", HN:"340", HK:"344", HU:"348", IS:"352",
      IN:"356", ID:"360", IR:"364", IQ:"368", IE:"372", IM:"833",
      IL:"376", IT:"380", JM:"388", JP:"392", JE:"832", JO:"400",
      KZ:"398", KE:"404", KI:"296", KP:"408", KR:"410", KW:"414",
      KG:"417", LA:"418", LV:"428", LB:"422", LS:"426", LR:"430",
      LY:"434", LI:"438", LT:"440", LU:"442", MO:"446", MG:"450",
      MW:"454", MY:"458", MV:"462", ML:"466", MT:"470", MH:"584",
      MQ:"474", MR:"478", MU:"480", YT:"175", MX:"484", FM:"583",
      MD:"498", MC:"492", MN:"496", ME:"499", MS:"500", MA:"504",
      MZ:"508", MM:"104", NA:"516", NR:"520", NP:"524", NL:"528",
      NC:"540", NZ:"554", NI:"558", NE:"562", NG:"566", NU:"570",
      NF:"574", MK:"807", MP:"580", NO:"578", OM:"512", PK:"586",
      PW:"585", PS:"275", PA:"591", PG:"598", PY:"600", PE:"604",
      PH:"608", PN:"612", PL:"616", PT:"620", PR:"630", QA:"634",
      RE:"638", RO:"642", RU:"643", RW:"646", BL:"652", SH:"654",
      KN:"659", LC:"662", MF:"663", PM:"666", VC:"670", WS:"882",
      SM:"674", ST:"678", SA:"682", SN:"686", RS:"688", SC:"690",
      SL:"694", SG:"702", SX:"534", SK:"703", SI:"705", SB:"090",
      SO:"706", ZA:"710", GS:"239", SS:"728", ES:"724", LK:"144",
      SD:"729", SR:"740", SJ:"744", SE:"752", CH:"756", SY:"760",
      TW:"158", TJ:"762", TZ:"834", TH:"764", TL:"626", TG:"768",
      TK:"772", TO:"776", TT:"780", TN:"788", TR:"792", TM:"795",
      TC:"796", TV:"798", UG:"800", UA:"804", AE:"784", GB:"826",
      US:"840", UM:"581", UY:"858", UZ:"860", VU:"548", VE:"862",
      VN:"704", VG:"092", VI:"850", WF:"876", EH:"732", YE:"887",
      ZM:"894", ZW:"716"
    };
  }

  connectedCallback() {
    this.renderShell();
    this.sessionId = this.getSessionId();
    this.initialize();
  }

  disconnectedCallback() {
    this.destroyed = true;

    if (this.frame) {
      cancelAnimationFrame(this.frame);
    }

    clearInterval(this.heartbeatTimer);
    clearInterval(this.refreshTimer);
  }

  getSessionId() {
    const key = "elleWorldSession";

    let id = localStorage.getItem(key);

    if (!id) {
      if (
        window.crypto &&
        typeof window.crypto.randomUUID === "function"
      ) {
        id = crypto.randomUUID();
      } else {
        id =
          "elle_" +
          Date.now().toString(36) +
          "_" +
          Math.random()
            .toString(36)
            .slice(2);
      }

      localStorage.setItem(key, id);
    }

    return id;
  }

  renderShell() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          font-family:
            "Figtree",
            system-ui,
            sans-serif;
        }

        * {
          box-sizing: border-box;
        }

        .world-card {
          position: relative;
          overflow: hidden;

          border:
            1px solid
            rgba(255,255,255,.86);

          border-radius: 28px;

          background:
            radial-gradient(
              circle at 50% 43%,
              rgba(121,85,160,.18),
              transparent 34%
            ),
            radial-gradient(
              circle at 20% 15%,
              rgba(255,95,151,.12),
              transparent 28%
            ),
            radial-gradient(
              circle at 82% 14%,
              rgba(104,202,255,.11),
              transparent 28%
            ),
            linear-gradient(
              145deg,
              #211725,
              #2e2035 55%,
              #17131d
            );

          box-shadow:
            0 26px 65px -47px
            rgba(32,20,44,.65);

          color: white;
        }

        .world-card::before {
          content: "";

          position: absolute;
          inset: 0;

          pointer-events: none;

          background:
            linear-gradient(
              120deg,
              rgba(255,255,255,.05),
              transparent 25%,
              transparent 70%,
              rgba(255,255,255,.03)
            );
        }

        .world-layout {
          position: relative;
          z-index: 2;

          display: grid;

          grid-template-columns:
            minmax(260px, .95fr)
            minmax(300px, 1.05fr);

          gap: 12px;

          min-height: 405px;
        }

        .world-copy {
          padding:
            29px
            18px
            27px
            27px;

          display: flex;
          flex-direction: column;
          justify-content: center;

          min-width: 0;
        }

        .world-eyebrow {
          color: #e2bd71;

          font-size: 9px;
          font-weight: 800;

          letter-spacing: .18em;

          text-transform: uppercase;
        }

        .world-title {
          margin-top: 7px;

          font-family:
            "Playfair Display",
            Georgia,
            serif;

          font-size:
            clamp(29px,5vw,45px);

          line-height: 1.02;
        }

        .world-title span {
          background:
            linear-gradient(
              90deg,
              #ff7baa,
              #ffd476,
              #7bd8ff
            );

          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .world-script {
          margin-top: 4px;

          color: #ff84b0;

          font-family:
            "Caveat",
            cursive;

          font-size: 20px;
          font-weight: 700;
        }

        .world-description {
          max-width: 380px;

          margin-top: 13px;

          color:
            rgba(255,255,255,.67);

          font-size: 12px;
          line-height: 1.6;
        }

        .world-live {
          width: fit-content;

          margin-top: 15px;

          display: flex;
          align-items: center;

          gap: 7px;

          padding: 7px 10px;

          border:
            1px solid
            rgba(255,255,255,.10);

          border-radius: 999px;

          color:
            rgba(255,255,255,.78);

          background:
            rgba(255,255,255,.055);

          font-size: 10px;
          font-weight: 700;
        }

        .live-dot {
          width: 7px;
          height: 7px;

          flex-shrink: 0;

          border-radius: 50%;

          background: #54e58a;

          box-shadow:
            0 0 0 5px
            rgba(84,229,138,.10),
            0 0 16px
            rgba(84,229,138,.65);

          animation:
            livePulse
            1.7s ease-in-out infinite;
        }

        @keyframes livePulse {
          0%,
          100% {
            transform: scale(.85);
            opacity: .72;
          }

          50% {
            transform: scale(1.14);
            opacity: 1;
          }
        }

        .world-stats {
          display: flex;
          flex-wrap: wrap;

          gap: 8px;

          margin-top: 13px;
        }

        .world-stat {
          min-width: 95px;

          padding: 9px 11px;

          border:
            1px solid
            rgba(255,255,255,.08);

          border-radius: 13px;

          background:
            rgba(255,255,255,.045);
        }

        .world-stat strong {
          display: block;

          color: white;

          font-family:
            "Playfair Display",
            Georgia,
            serif;

          font-size: 18px;
        }

        .world-stat span {
          display: block;

          margin-top: 1px;

          color:
            rgba(255,255,255,.45);

          font-size: 8px;

          letter-spacing: .05em;

          text-transform: uppercase;
        }

        .country-list {
          min-height: 29px;

          display: flex;
          flex-wrap: wrap;

          gap: 5px;

          margin-top: 12px;
        }

        .country-pill {
          display: flex;
          align-items: center;

          gap: 5px;

          padding: 5px 8px;

          border-radius: 999px;

          color:
            rgba(255,255,255,.68);

          background:
            rgba(255,255,255,.055);

          font-size: 9px;
        }

        .country-spark {
          color: #ffd272;
        }

        .privacy-note {
          margin-top: 14px;

          color:
            rgba(255,255,255,.36);

          font-size: 8.5px;
          line-height: 1.5;
        }

        .privacy-note strong {
          color:
            rgba(255,255,255,.54);
        }

        .globe-side {
          position: relative;

          min-width: 0;
          min-height: 405px;

          overflow: hidden;

          display: grid;
          place-items: center;
        }

        .globe-halo {
          position: absolute;

          width: min(95%,420px);
          aspect-ratio: 1;

          border-radius: 50%;

          background:
            radial-gradient(
              circle,
              rgba(255,112,168,.12),
              rgba(122,91,255,.07) 35%,
              transparent 69%
            );

          filter: blur(8px);

          pointer-events: none;
        }

        svg {
          position: relative;
          z-index: 2;

          display: block;

          width: 100%;
          max-width: 450px;
          height: auto;

          overflow: visible;
        }

        .sphere {
          fill:
            rgba(13,9,18,.72);

          stroke:
            rgba(255,255,255,.14);

          stroke-width: .8;
        }

        .graticule {
          fill: none;

          stroke:
            rgba(255,255,255,.055);

          stroke-width: .45;
        }

        .country {
          fill:
            rgba(255,255,255,.075);

          stroke:
            rgba(255,255,255,.10);

          stroke-width: .35;

          transition:
            fill .4s ease;
        }

        .country.active {
          fill:
            rgba(255,182,107,.42);

          stroke:
            rgba(255,224,159,.7);

          stroke-width: .55;
        }

        .glow-ring {
          fill: none;

          stroke:
            rgba(255,117,169,.75);

          stroke-width: 1.2;

          opacity: .7;
        }

        .glow-core {
          fill: #ffd66f;

          stroke: white;
          stroke-width: .7;

          filter:
            drop-shadow(
              0 0 6px
              rgba(255,116,168,.95)
            );
        }

        .loading {
          position: absolute;
          z-index: 4;

          padding: 8px 11px;

          border-radius: 999px;

          color:
            rgba(255,255,255,.64);

          background:
            rgba(20,14,24,.72);

          font-size: 9px;

          backdrop-filter:
            blur(8px);
        }

        .loading.hidden {
          display: none;
        }

        .world-error {
          margin-top: 10px;

          color:
            rgba(255,205,164,.65);

          font-size: 9px;
        }

        @media (max-width: 760px) {
          .world-layout {
            grid-template-columns: 1fr;

            min-height: auto;
          }

          .world-copy {
            padding:
              21px 18px 6px;

            text-align: center;
            align-items: center;
          }

          .world-description {
            max-width: 490px;
          }

          .world-stats {
            justify-content: center;
          }

          .country-list {
            justify-content: center;
          }

          .globe-side {
            min-height: 320px;
          }

          svg {
            max-width: 355px;
          }
        }

        @media (max-width: 430px) {
          .world-card {
            border-radius: 22px;
          }

          .world-layout {
            gap: 0;
          }

          .world-copy {
            padding:
              18px
              13px
              0;
          }

          .world-title {
            font-size: 32px;
          }

          .world-description {
            font-size: 10.5px;
          }

          .world-live {
            font-size: 9px;
          }

          .world-stat {
            min-width: 82px;

            padding: 7px 8px;
          }

          .world-stat strong {
            font-size: 15px;
          }

          .globe-side {
            min-height: 275px;
          }

          svg {
            max-width: 300px;
          }
        }

        @media (
          prefers-reduced-motion: reduce
        ) {
          .live-dot {
            animation: none;
          }
        }
      </style>

      <section
        class="world-card"
        aria-label="Elle World live global presence"
      >

        <div class="world-layout">

          <div class="world-copy">

            <div class="world-eyebrow">
              AURYNELLE∞ IDEAS
            </div>

            <div class="world-title">
              ELLE <span>WORLD</span> 🌍
            </div>

            <div class="world-script">
              look who's glowing with Elle...
            </div>

            <p class="world-description">
              Little lights around the world mean
              somebody is spending time with Elle.
              No names. No exact locations.
              Just a beautiful reminder that none
              of us are as alone as we think.
            </p>

            <div class="world-live">

              <span class="live-dot"></span>

              <span id="liveText">
                Connecting Elle World...
              </span>

            </div>

            <div class="world-stats">

              <div class="world-stat">

                <strong id="activeCount">
                  0
                </strong>

                <span>
                  glowing now
                </span>

              </div>

              <div class="world-stat">

                <strong id="countryCount">
                  0
                </strong>

                <span>
                  countries
                </span>

              </div>

            </div>

            <div
              class="country-list"
              id="countryList"
            ></div>

            <div class="privacy-note">
              🔒
              <strong>
                Country-level only.
              </strong>
              Elle World does not display names,
              cities, exact coordinates,
              or public IP addresses.
              Activity represents approximately
              the last two minutes.
            </div>

            <div
              class="world-error"
              id="worldError"
            ></div>

          </div>

          <div class="globe-side">

            <div class="globe-halo"></div>

            <div
              class="loading"
              id="loading"
            >
              Waking up the world ✨
            </div>

            <svg
              id="globe"
              viewBox="0 0 440 440"
              role="img"
              aria-label="Rotating globe showing countries with recent Elle activity"
            ></svg>

          </div>

        </div>

      </section>
    `;
  }

  async initialize() {
    try {
      await this.loadGlobeLibraries();

      await this.sendHeartbeat();

      await this.refreshPresence();

      this.startAnimation();

      this.startTimers();

      document.addEventListener(
        "visibilitychange",
        this.handleVisibility
      );
    } catch (error) {
      console.error(
        "Elle World initialization error:",
        error
      );

      this.showError(
        "Elle World is resting for a moment. 🌍"
      );
    }
  }

  handleVisibility = () => {
    if (
      document.visibilityState ===
      "visible"
    ) {
      this.sendHeartbeat();
      this.refreshPresence();
    }
  };

  async loadGlobeLibraries() {
    const [
      d3Module,
      topoModule,
      worldModule
    ] = await Promise.all([
      import(
        "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm"
      ),
      import(
        "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm"
      ),
      import(
        "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json/+esm"
      )
    ]);

    this.d3 = d3Module;
    this.topojson = topoModule;

    const world =
      worldModule.default ||
      worldModule;

    this.worldFeatures =
      this.topojson.feature(
        world,
        world.objects.countries
      ).features;

    this.svg =
      this.d3.select(
        this.shadowRoot
          .getElementById("globe")
      );

    this.projection =
      this.d3.geoOrthographic()
        .translate([220,220])
        .scale(190)
        .clipAngle(90)
        .precision(.6);

    this.path =
      this.d3.geoPath(
        this.projection
      );

    this.graticule =
      this.d3.geoGraticule10();

    this.drawGlobe();

    this.globeReady = true;

    this.shadowRoot
      .getElementById("loading")
      .classList
      .add("hidden");
  }

  drawGlobe() {
    this.svg
      .selectAll("*")
      .remove();

    this.svg
      .append("path")
      .datum({
        type: "Sphere"
      })
      .attr(
        "class",
        "sphere"
      );

    this.svg
      .append("path")
      .datum(
        this.graticule
      )
      .attr(
        "class",
        "graticule"
      );

    this.countryGroup =
      this.svg
        .append("g");

    this.countryPaths =
      this.countryGroup
        .selectAll("path")
        .data(
          this.worldFeatures
        )
        .join("path")
        .attr(
          "class",
          "country"
        );

    this.pulseGroup =
      this.svg
        .append("g");

    this.renderFrame();
  }

  async sendHeartbeat() {
    if (
      !this.sessionId
    ) {
      return;
    }

    try {
      const response =
        await fetch(
          "/api/world",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({
                sessionId:
                  this.sessionId
              })
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        data.success !== true
      ) {
        throw new Error(
          data.error ||
          "Heartbeat failed"
        );
      }

      if (
        data.live
      ) {
        this.applyPresence(
          data.live
        );
      }
    } catch (error) {
      console.error(
        "Elle World heartbeat:",
        error
      );
    }
  }

  async refreshPresence() {
    try {
      const response =
        await fetch(
          "/api/world",
          {
            method: "GET",
            cache: "no-store"
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        data.success !== true
      ) {
        throw new Error(
          data.error ||
          "Presence refresh failed"
        );
      }

      this.applyPresence(
        data.live || {
          totalActive: 0,
          countryCount: 0,
          countries: []
        }
      );

      this.showError("");
    } catch (error) {
      console.error(
        "Elle World refresh:",
        error
      );

      this.showError(
        "Live lights are reconnecting..."
      );
    }
  }

  applyPresence(live) {
    const countries =
      Array.isArray(
        live.countries
      )
        ? live.countries
        : [];

    this.countries =
      countries;

    const totalActive =
      Number(
        live.totalActive || 0
      );

    const countryCount =
      Number(
        live.countryCount || 0
      );

    this.shadowRoot
      .getElementById(
        "activeCount"
      )
      .textContent =
        String(totalActive);

    this.shadowRoot
      .getElementById(
        "countryCount"
      )
      .textContent =
        String(countryCount);

    const liveText =
      this.shadowRoot
        .getElementById(
          "liveText"
        );

    if (
      totalActive === 0
    ) {
      liveText.textContent =
        "Waiting for the first glow ✨";
    } else if (
      countryCount === 1
    ) {
      liveText.textContent =
        "Elle is glowing in 1 country right now ✨";
    } else {
      liveText.textContent =
        `Elle is glowing in ${countryCount} countries right now ✨`;
    }

    this.renderCountryList();

    if (
      this.globeReady
    ) {
      this.updateActiveCountries();
    }
  }

  renderCountryList() {
    const holder =
      this.shadowRoot
        .getElementById(
          "countryList"
        );

    holder.innerHTML = "";

    this.countries
      .slice(0,5)
      .forEach(country => {
        const pill =
          document.createElement(
            "div"
          );

        pill.className =
          "country-pill";

        const count =
          Number(
            country.active || 0
          );

        /*
          We intentionally avoid making
          tiny country activity feel
          personally identifiable.

          1 to 4 active users are shown
          simply as "glowing."
        */

        const activity =
          count < 5
            ? "glowing"
            : `${count} active`;

        pill.innerHTML = `
          <span class="country-spark">
            ✦
          </span>
          <span>
            ${this.escapeHtml(
              country.name ||
              country.code
            )}
            ·
            ${activity}
          </span>
        `;

        holder.appendChild(
          pill
        );
      });
  }

  escapeHtml(value) {
    return String(
      value || ""
    )
      .replaceAll(
        "&",
        "&amp;"
      )
      .replaceAll(
        "<",
        "&lt;"
      )
      .replaceAll(
        ">",
        "&gt;"
      )
      .replaceAll(
        '"',
        "&quot;"
      )
      .replaceAll(
        "'",
        "&#039;"
      );
  }

  activeNumericIds() {
    const ids =
      new Set();

    this.countries
      .forEach(country => {
        const numeric =
          this.numericByAlpha2[
            country.code
          ];

        if (numeric) {
          ids.add(
            String(
              Number(numeric)
            )
          );
        }
      });

    return ids;
  }

  updateActiveCountries() {
    const activeIds =
      this.activeNumericIds();

    this.countryPaths
      .classed(
        "active",
        feature =>
          activeIds.has(
            String(
              feature.id
            )
          )
      );

    this.renderPulses();
  }

  renderPulses() {
    if (
      !this.pulseGroup
    ) {
      return;
    }

    const activeIds =
      this.activeNumericIds();

    const activeFeatures =
      this.worldFeatures
        .filter(feature =>
          activeIds.has(
            String(
              feature.id
            )
          )
        );

    const pulses =
      this.pulseGroup
        .selectAll(
          "g.pulse"
        )
        .data(
          activeFeatures,
          feature =>
            feature.id
        )
        .join(
          enter => {
            const group =
              enter
                .append("g")
                .attr(
                  "class",
                  "pulse"
                );

            group
              .append("circle")
              .attr(
                "class",
                "glow-ring"
              )
              .attr(
                "r",
                7
              );

            group
              .append("circle")
              .attr(
                "class",
                "glow-core"
              )
              .attr(
                "r",
                2.8
              );

            return group;
          }
        );

    pulses.each(
      (
        feature,
        index,
        nodes
      ) => {
        const center =
          this.d3.geoCentroid(
            feature
          );

        const point =
          this.projection(
            center
          );

        const visible =
          this.d3.geoDistance(
            center,
            [
              -this.rotation[0],
              -this.rotation[1]
            ]
          ) <
          Math.PI / 2;

        const group =
          this.d3.select(
            nodes[index]
          );

        if (
          !point ||
          !visible
        ) {
          group.attr(
            "display",
            "none"
          );

          return;
        }

        group
          .attr(
            "display",
            null
          )
          .attr(
            "transform",
            `translate(${point[0]},${point[1]})`
          );
      }
    );
  }

  renderFrame() {
    if (
      !this.projection ||
      !this.path
    ) {
      return;
    }

    this.projection.rotate(
      this.rotation
    );

    this.svg
      .select(".sphere")
      .attr(
        "d",
        this.path
      );

    this.svg
      .select(".graticule")
      .attr(
        "d",
        this.path
      );

    if (
      this.countryPaths
    ) {
      this.countryPaths
        .attr(
          "d",
          this.path
        );
    }

    this.renderPulses();
  }

  startAnimation() {
    const reducedMotion =
      window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

    if (reducedMotion) {
      this.renderFrame();
      return;
    }

    const animate = now => {
      if (
        this.destroyed
      ) {
        return;
      }

      const delta =
        Math.min(
          now -
          this.lastFrame,
          40
        );

      this.lastFrame =
        now;

      /*
        Gentle rotation.
        Slow enough to feel luxurious,
        fast enough to look alive.
      */

      this.rotation[0] +=
        delta * .0042;

      if (
        this.rotation[0] > 180
      ) {
        this.rotation[0] -=
          360;
      }

      this.renderFrame();

      this.frame =
        requestAnimationFrame(
          animate
        );
    };

    this.frame =
      requestAnimationFrame(
        animate
      );
  }

  startTimers() {
    /*
      Heartbeat every 40 seconds.
      Redis expires presence after
      approximately 2 minutes.
    */

    this.heartbeatTimer =
      setInterval(
        () => {
          if (
            document.visibilityState ===
            "visible"
          ) {
            this.sendHeartbeat();
          }
        },
        40000
      );

    /*
      Pull aggregate globe activity
      often enough to feel live without
      hammering the free database.
    */

    this.refreshTimer =
      setInterval(
        () => {
          if (
            document.visibilityState ===
            "visible"
          ) {
            this.refreshPresence();
          }
        },
        15000
      );
  }

  showError(message) {
    const element =
      this.shadowRoot
        .getElementById(
          "worldError"
        );

    if (element) {
      element.textContent =
        message || "";
    }
  }
}

if (
  !customElements.get(
    "elle-world"
  )
) {
  customElements.define(
    "elle-world",
    ElleWorld
  );
}
