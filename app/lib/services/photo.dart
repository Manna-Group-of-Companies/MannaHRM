/// The face on a punch.
///
/// A photo taken at the press, sent with the punch, and shown beside it on the
/// dashboard's App Punches page — so that "who pressed the button" is a thing
/// HR can look at rather than take on trust.
///
/// **It is evidence, not a gate.** Like the coordinate, a punch with no photo
/// is still sent and the dashboard draws it as having none. The bias in this
/// project is that refusing somebody who did turn up is the expensive mistake
/// (CLAUDE.md §4): a phone with a broken front camera must not cost its owner a
/// day's pay. The one case that does stop the punch is the person backing out
/// of the camera themselves — that is them choosing not to punch yet, and the
/// button is still there.
library;

import 'package:image_picker/image_picker.dart';

/// Small enough to upload on one bar of 2G at a gate, large enough to tell two
/// people apart. 640 px at quality 60 is about 60–90 KB off a front camera.
const double kPhotoMaxSide = 640;
const int kPhotoQuality = 60;

/// What the camera gave back.
class Snap {
  const Snap({this.path, this.cancelled = false, this.problem = ''});

  /// The JPEG on the phone, or null.
  final String? path;

  /// The person closed the camera without taking one.
  final bool cancelled;

  /// Why there is no photo when it was not the person's choice — no camera,
  /// permission refused. Empty otherwise.
  final String problem;

  bool get has => path != null;
}

Future<Snap> takePunchPhoto() async {
  try {
    final shot = await ImagePicker().pickImage(
      source: ImageSource.camera,
      // A request, not a promise: some Android camera apps ignore it and open
      // the back camera. The photo is still a photo of the gate somebody is
      // standing at, which is worth more than none.
      preferredCameraDevice: CameraDevice.front,
      maxWidth: kPhotoMaxSide,
      maxHeight: kPhotoMaxSide,
      imageQuality: kPhotoQuality,
    );
    if (shot == null) return const Snap(cancelled: true);
    return Snap(path: shot.path);
  } catch (_) {
    // No camera app, or the permission refused. Not the person's choice to
    // skip the photo in the sense that matters, so the punch goes without one
    // and says so.
    return Snap(problem: 'The camera could not be opened, so this punch went without a photo.');
  }
}
