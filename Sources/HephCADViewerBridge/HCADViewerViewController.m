#import "HCADViewerViewController.h"

@interface HCADViewerViewController ()

@property (nonatomic, strong) UILabel *bodyLabel;
@property (nonatomic, strong) UILabel *overlayLabel;
@property (nonatomic, copy) NSArray<NSString *> *loadedBodyNames;

@end

@implementation HCADViewerViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [UIColor colorWithRed:0.09 green:0.11 blue:0.14 alpha:1.0];

    _bodyLabel = [[UILabel alloc] init];
    _bodyLabel.translatesAutoresizingMaskIntoConstraints = NO;
    _bodyLabel.textColor = UIColor.whiteColor;
    _bodyLabel.numberOfLines = 0;
    _bodyLabel.font = [UIFont monospacedSystemFontOfSize:18 weight:UIFontWeightSemibold];

    _overlayLabel = [[UILabel alloc] init];
    _overlayLabel.translatesAutoresizingMaskIntoConstraints = NO;
    _overlayLabel.textColor = [UIColor colorWithWhite:1.0 alpha:0.75];
    _overlayLabel.numberOfLines = 0;
    _overlayLabel.font = [UIFont monospacedSystemFontOfSize:13 weight:UIFontWeightRegular];

    [self.view addSubview:_bodyLabel];
    [self.view addSubview:_overlayLabel];

    [NSLayoutConstraint activateConstraints:@[
        [_bodyLabel.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor constant:24],
        [_bodyLabel.topAnchor constraintEqualToAnchor:self.view.topAnchor constant:24],
        [_bodyLabel.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor constant:-24],
        [_overlayLabel.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor constant:24],
        [_overlayLabel.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor constant:-24],
        [_overlayLabel.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor constant:-24]
    ]];

    UIPanGestureRecognizer *orbitGesture = [[UIPanGestureRecognizer alloc] initWithTarget:self action:@selector(handleOrbit:)];
    [self.view addGestureRecognizer:orbitGesture];

    UIPinchGestureRecognizer *pinchGesture = [[UIPinchGestureRecognizer alloc] initWithTarget:self action:@selector(handlePinch:)];
    [self.view addGestureRecognizer:pinchGesture];

    UITapGestureRecognizer *tapGesture = [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(handleTap:)];
    [self.view addGestureRecognizer:tapGesture];

    [self renderState];
}

- (void)loadSceneWithBodyNames:(NSArray<NSString *> *)bodyNames {
    self.loadedBodyNames = [bodyNames copy];
    [self renderState];
}

- (void)applyVisibilityForBodyNames:(NSArray<NSString *> *)bodyNames {
    self.overlayLabel.text = [NSString stringWithFormat:@"Visible: %@", [bodyNames componentsJoinedByString:@", "]];
}

- (void)applyIsolationForBodyNames:(NSArray<NSString *> *)bodyNames {
    if (bodyNames == nil) {
        self.overlayLabel.text = @"Isolation cleared";
        return;
    }
    self.overlayLabel.text = [NSString stringWithFormat:@"Isolated: %@", [bodyNames componentsJoinedByString:@", "]];
}

- (void)applyTransparency:(double)value forBodyName:(NSString *)bodyName {
    self.overlayLabel.text = [NSString stringWithFormat:@"%@ transparency %.2f", bodyName, value];
}

- (void)insertReferenceImagePlaneNamed:(NSString *)name opacity:(double)opacity {
    self.overlayLabel.text = [NSString stringWithFormat:@"Reference image %@ opacity %.2f", name, opacity];
}

- (NSString *)pickAtPoint:(CGPoint)point {
    (void)point;
    return self.loadedBodyNames.firstObject;
}

- (void)handleOrbit:(UIPanGestureRecognizer *)gesture {
    if (gesture.state == UIGestureRecognizerStateChanged) {
        CGPoint translation = [gesture translationInView:self.view];
        self.overlayLabel.text = [NSString stringWithFormat:@"Orbit Δ(%.1f, %.1f)", translation.x, translation.y];
    }
}

- (void)handlePinch:(UIPinchGestureRecognizer *)gesture {
    if (gesture.state == UIGestureRecognizerStateChanged) {
        self.overlayLabel.text = [NSString stringWithFormat:@"Zoom %.2f", gesture.scale];
    }
}

- (void)handleTap:(UITapGestureRecognizer *)gesture {
    NSString *picked = [self pickAtPoint:[gesture locationInView:self.view]];
    self.overlayLabel.text = picked != nil ? [NSString stringWithFormat:@"Selected %@", picked] : @"No selection";
}

- (void)renderState {
    NSString *title = self.loadedBodyNames.count > 0 ? [self.loadedBodyNames componentsJoinedByString:@"\n"] : @"Demo B-rep shape pending";
    self.bodyLabel.text = [NSString stringWithFormat:@"HephCAD Viewer\n%@", title];
    if (self.overlayLabel.text.length == 0) {
        self.overlayLabel.text = @"Stub viewer: orbit / zoom / select gestures wired for Phase 1 shell.";
    }
}

@end
