/**
 * The little face in the account control.
 *
 * Google hands us a photo. Email sign-up does not, so that state is the
 * same person-glyph the rest of the app already draws — not a hollow status
 * dot pretending to be an identity.
 */
import { icon } from './v2/icons.js';

export function paintFace(well, auth) {
  const on = !!auth?.signedIn;
  const photo = on ? (auth.user?.photo || auth.photo || '') : '';
  well.classList.toggle('is-in', on);
  well.classList.toggle('has-photo', !!photo);
  if (photo) {
    let img = well.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.decoding = 'async';
      well.replaceChildren(img);
    }
    img.onerror = () => {
      well.classList.remove('has-photo');
      well.replaceChildren(icon('user', { size: 18 }));
    };
    if (img.getAttribute('src') !== photo) img.src = photo;
    return;
  }
  well.replaceChildren(icon('user', { size: 18 }));
}
