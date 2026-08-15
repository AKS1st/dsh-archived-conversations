window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-archived-conversations",
	factory: (require) => {
		var module = { exports: {} };
		module.exports;
		//#region src/client/index.js
		/**
		* dsh-archived-conversations — browser half (client plugin module).
		*
		* Adds an "Archived" entry to the sidebar footer action row
		* (`sidebar.footer.action`). Clicking it opens a panel listing every archived
		* conversation (title + relative time); clicking one fetches a read-only text
		* preview from the host half (`GET /__archived-conversations/preview`) and
		* shows the most recent user/assistant messages.
		*
		* The product intentionally forbids opening archived sessions (an archived
		* current selection is immediately cleared back to the New Session view), and
		* no unarchive API exists yet — so this is deliberately a read-only preview,
		* never a navigation or a state mutation.
		*
		* Client plugin entry: exports a Cordis plugin (`apply` + `inject`); the
		* package build wraps it in the browser loader handoff
		* (`window.__ModuleLoader__.load`), which resolves `react` through the module
		* table and calls `apply` once the `slots` service is available.
		*/
		const React = require("react");
		const API_PREVIEW = "/__archived-conversations/preview";
		const ZH = {
			"label": "已归档",
			"aria.open": "显示已归档对话",
			"title": "已归档对话",
			"empty": "暂无已归档对话",
			"back": "返回列表",
			"preview.empty": "该对话没有可显示的文本消息",
			"preview.error": "无法读取该对话内容",
			"role.user": "用户",
			"role.assistant": "助手",
			"time.now": "刚刚",
			"time.minutes": "{n} 分钟前",
			"time.hours": "{n} 小时前",
			"time.days": "{n} 天前",
			"time.months": "{n} 个月前",
			"time.years": "{n} 年前"
		};
		const EN = {
			"label": "Archived",
			"aria.open": "Show archived conversations",
			"title": "Archived conversations",
			"empty": "No archived conversations",
			"back": "Back to list",
			"preview.empty": "This conversation has no displayable text",
			"preview.error": "Could not read this conversation",
			"role.user": "You",
			"role.assistant": "Assistant",
			"time.now": "now",
			"time.minutes": "{n} min ago",
			"time.hours": "{n} h ago",
			"time.days": "{n} d ago",
			"time.months": "{n} mo ago",
			"time.years": "{n} y ago"
		};
		function relativeTime(updatedAt, now, t) {
			const diff = Math.max(0, now - updatedAt);
			const MIN = 6e4;
			const HOUR = 36e5;
			const DAY = 864e5;
			if (diff < MIN) return t("time.now");
			if (diff < HOUR) return t("time.minutes", { n: Math.floor(diff / MIN) });
			if (diff < DAY) return t("time.hours", { n: Math.floor(diff / HOUR) });
			if (diff < 30 * DAY) return t("time.days", { n: Math.floor(diff / DAY) });
			if (diff < 365 * DAY) return t("time.months", { n: Math.floor(diff / (30 * DAY)) });
			return t("time.years", { n: Math.floor(diff / (365 * DAY)) });
		}
		/**
		* Fetch the host preview for one archived session. The route lives on
		* the same origin (webServer), returns JSON, and is read-only.
		*/
		function fetchPreview(sessionId) {
			return fetch(`${API_PREVIEW}?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" }).then((res) => res.json()).catch((error) => ({
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			}));
		}
		/**
		* The sidebar-footer entry: trigger button + panel (list / preview).
		* Data comes from the framework hooks (`useSessions`, `useWorkspaces`)
		* provided as standard props by the sidebar footer slot.
		*/
		function ArchivedAction(props, translate) {
			const wide = props.wide === true;
			const useSessions = props.useSessions;
			const useWorkspaces = props.useWorkspaces;
			const t = translate;
			const archivedIds = useWorkspaces((state) => state.archivedSessionIds);
			const byId = useSessions((state) => state.byId);
			const [open, setOpen] = React.useState(false);
			const [selectedId, setSelectedId] = React.useState(null);
			const [preview, setPreview] = React.useState(null);
			const [loading, setLoading] = React.useState(false);
			const rootRef = React.useRef(null);
			const rows = React.useMemo(() => {
				const result = [];
				for (const id of archivedIds) {
					const summary = byId[id];
					result.push({
						id,
						title: summary !== void 0 && summary.displayTitle !== "" ? summary.displayTitle : id,
						updatedAt: summary !== void 0 ? summary.updatedAt : 0
					});
				}
				result.sort((a, b) => b.updatedAt - a.updatedAt);
				return result;
			}, [archivedIds, byId]);
			React.useEffect(() => {
				if (!open) return;
				const closeOutside = (event) => {
					if (event.target instanceof Node && !(rootRef.current !== null && rootRef.current.contains(event.target))) setOpen(false);
				};
				const onKeyDown = (event) => {
					if (event.key !== "Escape") return;
					setOpen(false);
				};
				document.addEventListener("pointerdown", closeOutside);
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("pointerdown", closeOutside);
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [open]);
			const openPreview = (id) => {
				setSelectedId(id);
				setLoading(true);
				setPreview(null);
				fetchPreview(id).then((result) => {
					setPreview(result);
				}).finally(() => {
					setLoading(false);
				});
			};
			const backToList = () => {
				setSelectedId(null);
				setPreview(null);
				setLoading(false);
			};
			const now = Date.now();
			const count = rows.length;
			const selected = selectedId === null ? void 0 : rows.find((row) => row.id === selectedId);
			const messages = preview !== null && preview.ok === true && Array.isArray(preview.messages) ? preview.messages : [];
			const previewError = preview !== null && preview.ok !== true ? typeof preview.error === "string" ? preview.error : t("preview.error") : null;
			return React.createElement("div", {
				ref: rootRef,
				className: wide ? "dsa-root" : "dsa-root dsa-rail"
			}, React.createElement("button", {
				type: "button",
				className: "dsa-trigger",
				"aria-expanded": open,
				"aria-haspopup": "dialog",
				"aria-label": t("aria.open"),
				"data-active": open || void 0,
				onClick: () => {
					setOpen((v) => !v);
				}
			}, React.createElement("span", { className: "dsa-label" }, t("label")), count > 0 ? React.createElement("span", { className: "dsa-count" }, String(count)) : null), open ? React.createElement("div", {
				className: "dsa-panel",
				role: "dialog",
				"aria-label": t("title")
			}, React.createElement("div", { className: "dsa-header" }, selectedId !== null ? React.createElement("button", {
				type: "button",
				className: "dsa-back",
				onClick: backToList
			}, t("back")) : null, React.createElement("span", { className: "dsa-title" }, selectedId !== null && selected !== void 0 ? selected.title : t("title"))), React.createElement("div", { className: "dsa-body" }, selectedId === null ? rows.length === 0 ? React.createElement("div", { className: "dsa-empty" }, t("empty")) : React.createElement("ul", { className: "dsa-list" }, rows.map((row) => React.createElement("li", { key: row.id }, React.createElement("button", {
				type: "button",
				className: "dsa-row",
				onClick: () => openPreview(row.id)
			}, React.createElement("span", {
				className: "dsa-rowTitle",
				title: row.title
			}, row.title), React.createElement("span", { className: "dsa-rowTime" }, relativeTime(row.updatedAt, now, t)))))) : loading ? React.createElement("div", { className: "dsa-loading" }, "…") : previewError !== null ? React.createElement("div", { className: "dsa-error" }, previewError) : messages.length === 0 ? React.createElement("div", { className: "dsa-empty" }, t("preview.empty")) : React.createElement("div", { className: "dsa-preview" }, messages.map((msg, index) => React.createElement("div", {
				key: String(index),
				className: "dsa-msg"
			}, React.createElement("span", { className: "dsa-msgRole" }, msg.role === "user" ? t("role.user") : t("role.assistant")), React.createElement("span", { className: "dsa-msgText" }, String(msg.text))))))) : null);
		}
		/** Services this client plugin requires before activation (slots drives the registration). */
		const inject = ["slots"];
		/**
		* Plugin body: register the footer action entry and its styles.
		* @param ctx - client context (slots, locale).
		*/
		function apply(ctx) {
			const locale = ctx.get("locale");
			let translate;
			if (locale !== void 0) {
				ctx.effect(() => {
					const offZh = locale.register("archived-conversations", "zh", ZH);
					const offEn = locale.register("archived-conversations", "en", EN);
					return () => {
						offZh();
						offEn();
					};
				}, "dsh-archived-conversations: dictionaries");
				translate = locale.bind("archived-conversations");
			}
			if (translate === void 0) translate = (key) => EN[key] ?? key;
			ctx.effect(() => {
				const styleEl = document.createElement("style");
				styleEl.textContent = `
.dsa-root { position: relative; flex: none; display: flex; align-items: center; width: 100%; height: 49px; margin: 8px 0 0; }
.dsa-root.dsa-rail { width: 36px; height: 36px; margin: 0; }
.dsa-trigger {
  display: inline-flex; align-items: center; gap: 8px;
  width: 100%; height: 49px; padding: 0 8px 0 6px;
  border: none; border-radius: 12px; background: transparent;
  color: var(--dsw-alias-label-primary); font-family: inherit; font-size: 14px;
  cursor: pointer; overflow: hidden;
}
.dsa-trigger:hover { background: var(--dsw-alias-interactive-bg-hover-solid); }
.dsa-trigger[data-active] { background: var(--dsw-alias-interactive-bg-hover); }
.dsa-root.dsa-rail .dsa-trigger {
  justify-content: center; gap: 0; width: 36px; height: 36px; padding: 0; border-radius: 50%; font-size: 12px;
}
.dsa-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsa-count { flex: none; margin-left: auto; color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 16px; font-variant-numeric: tabular-nums; }
.dsa-root.dsa-rail .dsa-count { display: none; }
.dsa-panel {
  position: fixed; left: 12px; bottom: 128px; z-index: 30;
  display: flex; flex-direction: column;
  width: 380px; max-width: calc(100vw - 24px); max-height: 60vh;
  overflow: hidden; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px;
  background: var(--dsw-alias-bg-base); box-shadow: var(--dsw-shadow-lv2);
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}
.dsa-header {
  flex: none; display: flex; align-items: center; gap: 8px;
  min-height: 44px; padding: 10px 12px; box-sizing: border-box;
  border-bottom: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base);
}
.dsa-back {
  flex: none; padding: 2px 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px;
  background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11px; cursor: pointer;
}
.dsa-back:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsa-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 500; line-height: 20px; color: var(--dsw-alias-label-primary); }
.dsa-body { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 12px 12px; }
.dsa-list { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none; }
.dsa-row {
  display: flex; align-items: center; gap: 8px; box-sizing: border-box;
  width: 100%; min-height: 34px; padding: 6px 8px; border: none; border-radius: 8px;
  background: transparent; color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px; line-height: 18px; text-align: left; cursor: pointer;
}
.dsa-row:hover { background: var(--dsw-alias-fill-l2); }
.dsa-rowTitle { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.dsa-rowTime { flex: none; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.dsa-empty { padding: 16px 8px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dsa-preview { display: flex; flex-direction: column; gap: 10px; }
.dsa-msg { display: flex; flex-direction: column; gap: 4px; }
.dsa-msgRole { flex: none; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary); }
.dsa-msgText { font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); white-space: pre-wrap; word-break: break-word; }
.dsa-loading, .dsa-error { padding: 16px 8px; text-align: center; font-size: 12px; }
.dsa-loading { color: var(--dsw-alias-label-secondary); }
.dsa-error { color: var(--dsw-alias-state-error-primary); }
`;
				document.head.appendChild(styleEl);
				return () => {
					if (styleEl.parentNode !== null) styleEl.parentNode.removeChild(styleEl);
				};
			}, "dsh-archived-conversations: styles");
			const slots = ctx.get("slots");
			if (slots === void 0) return;
			ctx.effect(() => slots.inject("sidebar.footer.action", () => slots.register({
				name: "sidebar.footer.action",
				id: "archived-conversations",
				order: 30,
				label: () => translate("label")
			}, (props) => React.createElement(ArchivedAction, props, translate))), "dsh-archived-conversations: footer action");
		}
		module.exports = {
			apply,
			inject
		};
		//#endregion
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map