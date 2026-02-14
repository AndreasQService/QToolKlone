import rosetta from 'rosetta';
import de from './de';

const i18n = rosetta({
    de
});

i18n.locale('de');

export default i18n;

// Optional: A simple hook if you need reactive translations
// For now, since we only have one language, we might not need complex reactivity yet.
// But we can add it later if we implement language switching.
