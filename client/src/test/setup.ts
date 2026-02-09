import "@testing-library/jest-dom";

// JSDOM does not implement matchMedia; several components rely on it.
Object.defineProperty(window, "matchMedia", {
	writable: true,
	value: (query: string) => {
		return {
			matches: false,
			media: query,
			onchange: null,
			addEventListener: () => {},
			removeEventListener: () => {},
			addListener: () => {},
			removeListener: () => {},
			dispatchEvent: () => false,
		};
	},
});

// Ensure localStorage has the standard Web Storage API.
// Some environments/tools can stub this in a way that breaks setItem/getItem.
const inMemoryStorage = (() => {
	let store: Record<string, string> = {};
	return {
		get length() {
			return Object.keys(store).length;
		},
		clear() {
			store = {};
		},
		getItem(key: string) {
			return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
		},
		key(index: number) {
			const keys = Object.keys(store);
			return keys[index] ?? null;
		},
		removeItem(key: string) {
			delete store[key];
		},
		setItem(key: string, value: string) {
			store[key] = String(value);
		},
	};
})();

Object.defineProperty(window, "localStorage", {
	writable: true,
	value: inMemoryStorage,
});
