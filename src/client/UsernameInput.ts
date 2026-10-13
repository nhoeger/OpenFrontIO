import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { translateText } from "../client/Utils";
import { clampUsername, genAnonUsername } from "./PlayerName";
import {
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
  validateUsername,
} from "./validations/username";

interface LangSelectorLike {
  currentLang?: string;
  translations?: Record<string, string>;
  defaultTranslations?: Record<string, string>;
}

const usernameKey: string = "username";

// Shared by the input and its text, so any drift in box or text metrics shows
// up as the name jumping.
const NAME_BOX =
  "min-w-0 flex-1 h-full max-h-[44px] rounded-lg bg-transparent px-2 sm:px-3";
const NAME_TEXT =
  "text-xl/[normal] sm:text-2xl/[normal] font-medium tracking-wider " +
  "[text-shadow:0_1px_2px_rgba(0,0,0,0.9)]";

/** The name the player plays under, kept in this browser's storage. */
@customElement("username-input")
export class UsernameInput extends LitElement {
  private baseUsername: string = "";
  // Minted once so the placeholder name never changes under the player.
  private readonly generatedName: string = genAnonUsername();

  @property({ type: String }) validationError: string = "";
  private _isValid: boolean = true;
  private _lastValidatedLang: string | null = null;

  createRenderRoot() {
    // Disable shadow DOM to allow Tailwind classes to work
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadStoredUsername();
  }

  public getUsername(): string {
    return this.baseUsername.trim() || this.generatedName;
  }

  protected updated(): void {
    // Re-validate when translations become available or language changes,
    // since initial validation may run before translations are loaded.
    if (this.validationError) {
      const langSelector = document.querySelector<LangSelectorLike & Element>(
        "lang-selector",
      );
      const lang = langSelector?.currentLang;
      const hasTranslations =
        langSelector?.translations ?? langSelector?.defaultTranslations;
      if (hasTranslations && lang && lang !== this._lastValidatedLang) {
        this._lastValidatedLang = lang;
        this.validateAndStore();
      }
    }
  }

  private loadStoredUsername() {
    const stored = localStorage.getItem(usernameKey);
    this.baseUsername = stored ? clampUsername(stored) : this.generatedName;
    this.validateAndStore();
  }

  render() {
    return html`
      <div class="flex items-center w-full h-full gap-1.5 sm:gap-2">
        <input
          type="text"
          .value=${this.baseUsername}
          @input=${this.handleUsernameChange}
          placeholder="${translateText("username.enter_username")}"
          minlength="${MIN_USERNAME_LENGTH}"
          maxlength="${MAX_USERNAME_LENGTH}"
          aria-label=${translateText("username.enter_username")}
          class="text-left text-white placeholder-white/50 transition-colors text-ellipsis hover:bg-white/5 focus:bg-white/5 focus:outline-none focus:ring-2 focus:ring-malibu-blue/60 ${NAME_BOX} ${NAME_TEXT}"
        />
      </div>
      ${this.validationError
        ? html`<div
            class="absolute top-full left-0 z-50 w-full mt-1 flex flex-col gap-1"
          >
            <div
              id="username-validation-error"
              class="w-full px-3 py-2 text-sm font-medium border border-red-500/50 rounded-lg bg-red-900/90 text-red-200 backdrop-blur-md shadow-lg"
            >
              ${this.validationError}
            </div>
          </div>`
        : null}
    `;
  }

  private handleUsernameChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const originalValue = input.value;
    const val = originalValue.replace(/[[\]]/g, "");
    if (originalValue !== val) {
      input.value = val;
      // Show toast when brackets are removed
      window.dispatchEvent(
        new CustomEvent("show-message", {
          detail: {
            message: translateText("username.invalid_chars"),
            color: "red",
            duration: 2000,
          },
        }),
      );
    }
    this.baseUsername = val;
    this.validateAndStore();
  }

  private validateAndStore() {
    const trimmed = this.baseUsername.trim();
    const result = validateUsername(trimmed);
    this._isValid = result.isValid;
    if (result.isValid) {
      localStorage.setItem(usernameKey, trimmed);
      this.validationError = "";
    } else {
      this.validationError = result.error ?? "";
    }
    this.emitValidity();
  }

  // Broadcast play-eligibility so action buttons can disable themselves.
  private emitValidity() {
    window.dispatchEvent(
      new CustomEvent("username-validity-change", {
        detail: { isValid: this.canPlay() },
      }),
    );
  }

  // Play-eligibility: the name is syntactically valid.
  public canPlay(): boolean {
    return this._isValid;
  }
}
