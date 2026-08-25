window.__ModuleLoader__.load({
	id: "richfarm-care-preview",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		let react = require("react");

		const CSS = `
.cp-view { padding: 20px 24px 40px; width: 100%; box-sizing: border-box; }
.cp-article { max-width: 780px; }
.cp-view h2 { font-size: 19px; margin: 26px 0 10px; padding-bottom: 8px; border-bottom: 2px solid #eef0f3; }
.cp-view h2:first-child { margin-top: 0; }
.cp-view p { line-height: 1.7; margin: 10px 0; font-size: 14.5px; }
.cp-view ul { line-height: 1.7; padding-left: 22px; font-size: 14.5px; }
.cp-view strong { font-weight: 600; }
.cp-view code { background: #eef1f5; border-radius: 4px; padding: 1px 5px; font-size: .9em; }
.cp-tabs { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
.cp-tab { color: #2f6fed; border: 1px solid #d3e2ff; border-radius: 999px; padding: 4px 14px; font-size: 13px; background: #f4f8ff; cursor: pointer; }
.cp-tab.active { background: #2f6fed; color: #fff; border-color: #2f6fed; }
.cp-gridbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.cp-gridbar h3 { margin: 0; font-size: 14px; color: #555c66; font-weight: 600; }
.cp-refresh { border: 1px solid #e3e6ea; background: #fff; border-radius: 8px; padding: 5px 12px; font-size: 13px; cursor: pointer; color: #1f2430; }
.cp-refresh:hover { background: #f1f3f5; }
.cp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; width: 100%; }
.cp-item { border: 1px solid #e3e6ea; border-radius: 10px; padding: 12px 14px; cursor: pointer; background: #fff; text-align: left; font-size: 13px; color: #1f2430; width: 100%; display: flex; flex-direction: column; gap: 6px; min-height: 58px; justify-content: space-between; overflow: hidden; }
.cp-item:hover { border-color: #2f6fed; }
.cp-item .name { font-weight: 600; word-break: break-word; }
.cp-item .sci { color: #8a919c; font-size: 11.5px; word-break: break-word; }
.cp-item .locs { color: #8a919c; font-size: 12px; }
.cp-msg { color: #8a919c; padding: 24px 0; text-align: center; font-size: 14px; }
.cp-applink { display: inline-block; background: #eef4ff; color: #2f6fed; border: 1px solid #d3e2ff; border-radius: 999px; padding: 0 10px; font-size: .85em; margin: 0 2px; }
.cp-badge { display: inline-block; font-size: 12px; border-radius: 999px; padding: 1px 9px; background: #f1f3f5; color: #555c66; margin-left: 8px; }
.cp-back { border: 1px solid #e3e6ea; background: #fff; border-radius: 8px; padding: 6px 12px; font-size: 13px; cursor: pointer; color: #1f2430; margin-bottom: 12px; }
.cp-back:hover { background: #f1f3f5; }
.cp-titlebar { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.cp-titlebar h2 { margin: 0; border: none; padding: 0; font-size: 17px; }
`;

		const tagId = "richfarm-care-preview/cp.css";
		function ensureCss() {
			if (typeof document === "undefined") return;
			if (document.querySelector("style[data-plugin-css=\"" + tagId + "\"]") !== null) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "richfarm-care-preview";
			tag.dataset.pluginCss = tagId;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		const state = {
			plants: null,
			dir: null,
			loc: "vi",
			text: null,
			loading: false,
			error: null,
		};
		const listeners = new Set();
		const emit = () => listeners.forEach((fn) => fn());
		const setState = (patch) => { Object.assign(state, patch); emit(); };
		const useTick = () => {
			const [, setTick] = react.useState(0);
			react.useEffect(() => {
				const fn = () => setTick((t) => t + 1);
				listeners.add(fn);
				return () => listeners.delete(fn);
			}, []);
		};

		const loadList = (force) => {
			if (state.plants && !force) return Promise.resolve(state.plants);
			setState({ loading: true });
			return fetch("/care-preview/api/plants").then((r) => r.json()).then((res) => {
				if (res && res.ok) {
					setState({ plants: res.plants, loading: false });
					return res.plants;
				}
				setState({ error: (res && res.error) || "Không đọc được danh sách", loading: false });
				return null;
			}).catch((err) => {
				setState({ error: String((err && err.message) || err), loading: false });
				return null;
			});
		};

		const loadText = (dir, loc) => {
			setState({ loading: true, error: null });
			return fetch("/care-preview/api/read?dir=" + encodeURIComponent(dir) + "&loc=" + encodeURIComponent(loc))
				.then((r) => r.json()).then((res) => {
					if (res && res.ok) {
						setState({ dir, loc, text: res.text, loading: false });
					} else {
						setState({ error: (res && res.error) || "Không đọc được nội dung", loading: false });
					}
				}).catch((err) => {
					setState({ error: String((err && err.message) || err), loading: false });
				});
		};

		const backToList = () => setState({ dir: null, text: null, error: null });

		const renderInline = (text) => {
			const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
			return parts.map((part, i) => {
				if (!part) return null;
				if (part.startsWith("**") && part.endsWith("**")) {
					return react.createElement("strong", { key: i }, part.slice(2, -2));
				}
				if (part.startsWith("`") && part.endsWith("`")) {
					return react.createElement("code", { key: i }, part.slice(1, -1));
				}
				const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
				if (link) {
					const app = String(link[2]).startsWith("richfarm://");
					return react.createElement("span", {
						key: i,
						className: app ? "cp-applink" : undefined,
						title: app ? "Liên kết nội bộ app (không mở được ở đây)" : undefined,
					}, link[1]);
				}
				return part;
			});
		};

		const renderMarkdown = (src) => {
			const lines = String(src).split(/\r?\n/);
			const blocks = [];
			let list = null;
			const flushList = () => {
				if (list) { blocks.push(react.createElement("ul", { key: "ul" + blocks.length }, list)); list = null; }
			};
			for (const line of lines) {
				if (/^## /.test(line)) {
					flushList();
					blocks.push(react.createElement("h2", { key: "h" + blocks.length }, renderInline(line.slice(3))));
				} else if (/^- /.test(line)) {
					if (!list) list = [];
					list.push(react.createElement("li", { key: (list.length) }, renderInline(line.slice(2))));
				} else if (/^\s*$/.test(line)) {
					flushList();
				} else {
					flushList();
					blocks.push(react.createElement("p", { key: "p" + blocks.length }, renderInline(line)));
				}
			}
			flushList();
			return blocks;
		};

		const renderGrid = () => {
			if (!state.plants && state.loading) {
				return react.createElement("div", { className: "cp-msg" }, "Đang tải danh sách…");
			}
			if (!state.plants) {
				return react.createElement("div", { className: "cp-msg" },
					state.error || "Không có dữ liệu",
					react.createElement("div", { style: { marginTop: 12 } },
						react.createElement("button", { className: "cp-back", onClick: () => { setState({ plants: null, error: null }); loadList(true); } }, "Thử lại"),
					),
				);
			}
			const bar = react.createElement("div", { className: "cp-gridbar" },
				react.createElement("h3", null, "Danh sách cây (" + state.plants.length + ")"),
				react.createElement("button", { className: "cp-refresh", onClick: () => { setState({ plants: null, error: null }); loadList(true); } }, "Làm mới"),
			);
			const grid = react.createElement("div", { className: "cp-grid" }, state.plants.map((p) =>
				react.createElement("button", {
					key: p.dir,
					className: "cp-item",
					onClick: () => { const loc = p.vi ? "vi" : "en"; loadText(p.dir, loc); },
				},
					react.createElement("span", { className: "name" }, p.nameVi || p.dir),
					react.createElement("span", { className: "sci" }, p.dir),
					react.createElement("span", { className: "locs" },
						[p.vi ? "vi" : null, p.en ? "en" : null].filter(Boolean).join(" · "),
					),
				)
			));
			return react.createElement(react.Fragment, null, bar, grid);
		};

		const renderArticle = () => {
			const tabs = react.createElement("div", { className: "cp-tabs" }, ["vi", "en"].map((l) =>
				react.createElement("button", {
					key: l,
					className: "cp-tab" + (state.loc === l ? " active" : ""),
					onClick: () => loadText(state.dir, l),
				}, l === "vi" ? "Tiếng Việt" : "English"),
			));
			const content = state.loading
				? react.createElement("div", { className: "cp-msg" }, "Đang tải…")
				: react.createElement(react.Fragment, null, renderMarkdown(state.text || ""));
			const meta = state.plants ? state.plants.find((p) => p.dir === state.dir) : null;
			const title = (meta && meta.nameVi) || state.dir;
			return react.createElement("div", { key: "art", className: "cp-article" },
				react.createElement("div", { className: "cp-titlebar" },
					react.createElement("button", { className: "cp-back", onClick: backToList }, "← Danh sách"),
					react.createElement("h2", null, title),
					react.createElement("span", { className: "cp-badge" }, state.loc === "vi" ? "Tiếng Việt" : "English"),
				),
				tabs,
				content,
			);
		};

		const PreviewView = () => {
			useTick();
			react.useEffect(() => {
				loadList();
				return undefined;
			}, []);
			const body = state.dir ? renderArticle() : renderGrid();
			return react.createElement("div", { className: "cp-view" }, body);
		};

		/** Required services for the header-slot contribution. */
		const inject = ["slots"];

		/**
		 * Client plugin body: register the conversation view tab.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			ensureCss();
			ctx.slots.inject("conversation.view", () => ctx.slots.register({
				name: "conversation.view",
				id: "care-preview",
				order: 20,
				label: () => "Preview cây",
			}, PreviewView));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
