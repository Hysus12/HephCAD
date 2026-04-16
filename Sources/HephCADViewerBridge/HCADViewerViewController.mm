#import "HCADViewerViewController.h"

#import "HCADGLView.h"

@interface HCADViewerViewController ()

@property (nonatomic, assign) CGPoint firstTouch0;
@property (nonatomic, assign) CGPoint firstTouch1;
@property (nonatomic, assign) BOOL didSetupViewer;
@property (nonatomic, assign) CGPoint orbitAnchor;
@property (nonatomic, strong) UILabel *statusLabel;
@property (nonatomic, strong) UIImageView *referenceImageView;

@end

@implementation HCADViewerViewController

- (instancetype)init
{
    self = [super init];
    if (self) {
        _kernelSession = [[HCADKernelSession alloc] init];
    }
    return self;
}

- (void)loadView
{
    HCADGLView *glView = [[HCADGLView alloc] init];
    glView.viewerController = self;
    self.view = glView;
}

- (void)viewDidLoad
{
    [super viewDidLoad];

    UIPinchGestureRecognizer *zoomRecognizer = [[UIPinchGestureRecognizer alloc] initWithTarget:self action:@selector(zoomHandler:)];
    [self.view addGestureRecognizer:zoomRecognizer];

    UIPanGestureRecognizer *panRecognizer = [[UIPanGestureRecognizer alloc] initWithTarget:self action:@selector(panHandler:)];
    panRecognizer.maximumNumberOfTouches = 2;
    panRecognizer.minimumNumberOfTouches = 2;
    [self.view addGestureRecognizer:panRecognizer];

    UIPanGestureRecognizer *orbitRecognizer = [[UIPanGestureRecognizer alloc] initWithTarget:self action:@selector(orbitHandler:)];
    orbitRecognizer.maximumNumberOfTouches = 1;
    orbitRecognizer.minimumNumberOfTouches = 1;
    [self.view addGestureRecognizer:orbitRecognizer];

    UITapGestureRecognizer *tapRecognizer = [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(tapHandler:)];
    [tapRecognizer requireGestureRecognizerToFail:orbitRecognizer];
    [self.view addGestureRecognizer:tapRecognizer];

    _referenceImageView = [[UIImageView alloc] init];
    _referenceImageView.translatesAutoresizingMaskIntoConstraints = NO;
    _referenceImageView.contentMode = UIViewContentModeScaleAspectFit;
    _referenceImageView.hidden = YES;
    _referenceImageView.userInteractionEnabled = NO;
    [self.view addSubview:_referenceImageView];

    _statusLabel = [[UILabel alloc] init];
    _statusLabel.translatesAutoresizingMaskIntoConstraints = NO;
    _statusLabel.textColor = [UIColor colorWithWhite:1.0 alpha:0.85];
    _statusLabel.font = [UIFont monospacedSystemFontOfSize:12 weight:UIFontWeightRegular];
    _statusLabel.numberOfLines = 2;
    _statusLabel.text = @"OCCT viewer pending";
    [self.view addSubview:_statusLabel];

    [NSLayoutConstraint activateConstraints:@[
        [_referenceImageView.centerXAnchor constraintEqualToAnchor:self.view.centerXAnchor],
        [_referenceImageView.centerYAnchor constraintEqualToAnchor:self.view.centerYAnchor],
        [_referenceImageView.widthAnchor constraintEqualToConstant:220],
        [_referenceImageView.heightAnchor constraintEqualToConstant:220],
        [_statusLabel.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor constant:16],
        [_statusLabel.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor constant:-16],
        [_statusLabel.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor constant:-16],
    ]];
}

- (void)setupViewerIfNeeded
{
    if (self.didSetupViewer) {
        return;
    }
    [self.kernelSession prepareViewerInView:self.view];
    self.didSetupViewer = YES;
    self.statusLabel.text = @"OCCT viewer active";
}

- (void)draw
{
    [self.kernelSession drawViewer];
}

- (void)reloadScene
{
    [self.kernelSession reloadActiveScene];
    [(HCADGLView *)self.view drawView];
}

- (void)applyIsolationForBodyIDs:(NSArray<NSString *> *)bodyIDs
{
    [self.kernelSession setIsolatedBodyIDs:bodyIDs];
    self.statusLabel.text = bodyIDs.count > 0 ? @"Isolation applied" : @"Isolation cleared";
    [(HCADGLView *)self.view drawView];
}

- (void)applyTransparency:(double)value forBodyID:(NSString *)bodyID
{
    [self.kernelSession setBodyTransparencyWithID:bodyID value:value];
    self.statusLabel.text = [NSString stringWithFormat:@"%@ transparency %.2f", bodyID, value];
    [(HCADGLView *)self.view drawView];
}

- (void)updateReferenceImageNamed:(NSString *)name
                          opacity:(double)opacity
                        positionX:(double)positionX
                        positionY:(double)positionY
                         rotation:(double)rotation
                            scale:(double)scale
{
    if (name.length == 0) {
        self.referenceImageView.hidden = YES;
        return;
    }

    UIImage *image = [UIImage imageNamed:name];
    self.referenceImageView.hidden = image == nil;
    self.referenceImageView.image = image;
    self.referenceImageView.alpha = opacity;
    self.referenceImageView.transform = CGAffineTransformIdentity;
    self.referenceImageView.transform = CGAffineTransformTranslate(self.referenceImageView.transform, positionX, positionY);
    self.referenceImageView.transform = CGAffineTransformRotate(self.referenceImageView.transform, rotation);
    self.referenceImageView.transform = CGAffineTransformScale(self.referenceImageView.transform, scale, scale);
    self.statusLabel.text = [NSString stringWithFormat:@"Reference %@ opacity %.2f", name, opacity];
}

- (void)zoomHandler:(UIPinchGestureRecognizer *)pinchRecognizer
{
    if (pinchRecognizer.numberOfTouches < 2) {
        return;
    }

    if (pinchRecognizer.state == UIGestureRecognizerStateBegan) {
        self.firstTouch0 = [pinchRecognizer locationOfTouch:0 inView:self.view];
        self.firstTouch1 = [pinchRecognizer locationOfTouch:1 inView:self.view];
        return;
    }

    if (pinchRecognizer.state == UIGestureRecognizerStateChanged) {
        CGPoint lastTouch0 = [pinchRecognizer locationOfTouch:0 inView:self.view];
        CGPoint lastTouch1 = [pinchRecognizer locationOfTouch:1 inView:self.view];

        double startDistance = hypot(self.firstTouch0.x - self.firstTouch1.x, self.firstTouch0.y - self.firstTouch1.y);
        double endDistance = hypot(lastTouch0.x - lastTouch1.x, lastTouch0.y - lastTouch1.y);
        double deltaDistance = endDistance - startDistance;

        double centerX = (self.firstTouch0.x + self.firstTouch1.x) / 2.0;
        double centerY = (self.firstTouch0.y + self.firstTouch1.y) / 2.0;
        [self.kernelSession zoomAtX:(NSInteger)centerX y:(NSInteger)centerY delta:deltaDistance];

        self.firstTouch0 = lastTouch0;
        self.firstTouch1 = lastTouch1;
        [(HCADGLView *)self.view drawView];
    }
}

- (void)orbitHandler:(UIPanGestureRecognizer *)orbitRecognizer
{
    if (orbitRecognizer.numberOfTouches != 1) {
        return;
    }

    CGPoint point = [orbitRecognizer locationInView:self.view];
    if (orbitRecognizer.state == UIGestureRecognizerStateBegan) {
        self.orbitAnchor = point;
        [self.kernelSession startRotationAtX:(NSInteger)point.x y:(NSInteger)point.y];
        return;
    }

    if (orbitRecognizer.state == UIGestureRecognizerStateChanged) {
        [self.kernelSession rotateToX:(NSInteger)point.x y:(NSInteger)point.y];
        self.orbitAnchor = point;
        [(HCADGLView *)self.view drawView];
    }
}

- (void)panHandler:(UIPanGestureRecognizer *)panRecognizer
{
    if (panRecognizer.numberOfTouches < 2) {
        return;
    }

    if (panRecognizer.state == UIGestureRecognizerStateBegan) {
        self.firstTouch0 = [panRecognizer locationOfTouch:0 inView:self.view];
        self.firstTouch1 = [panRecognizer locationOfTouch:1 inView:self.view];
        return;
    }

    if (panRecognizer.state == UIGestureRecognizerStateChanged) {
        CGPoint lastTouch0 = [panRecognizer locationOfTouch:0 inView:self.view];
        CGPoint lastTouch1 = [panRecognizer locationOfTouch:1 inView:self.view];

        double startCenterX = (self.firstTouch0.x + self.firstTouch1.x) / 2.0;
        double startCenterY = (self.firstTouch0.y + self.firstTouch1.y) / 2.0;
        double endCenterX = (lastTouch0.x + lastTouch1.x) / 2.0;
        double endCenterY = (lastTouch0.y + lastTouch1.y) / 2.0;

        [self.kernelSession panByDX:(NSInteger)(endCenterX - startCenterX)
                                 dy:(NSInteger)(startCenterY - endCenterY)];

        self.firstTouch0 = lastTouch0;
        self.firstTouch1 = lastTouch1;
        [(HCADGLView *)self.view drawView];
    }
}

- (void)tapHandler:(UITapGestureRecognizer *)tapRecognizer
{
    CGPoint tapPoint = [tapRecognizer locationInView:self.view];
    NSString *selectedBodyID = [self.kernelSession selectBodyAtX:(NSInteger)tapPoint.x y:(NSInteger)tapPoint.y];
    self.statusLabel.text = selectedBodyID != nil ? [NSString stringWithFormat:@"Selected %@", selectedBodyID] : @"Selection cleared";
    [self.selectionDelegate viewerController:self didSelectBodyWithIdentifier:selectedBodyID];
    [(HCADGLView *)self.view drawView];
}

@end
