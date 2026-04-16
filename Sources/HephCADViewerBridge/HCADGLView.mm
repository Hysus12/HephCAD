#import "HCADGLView.h"

#import <OpenGLES/EAGL.h>
#import <OpenGLES/ES2/gl.h>
#import <QuartzCore/CAEAGLLayer.h>

#import "HCADViewerViewController.h"

@interface HCADViewerViewController (HCADGLViewInternal)

- (void)setupViewerIfNeeded;
- (void)draw;

@end

@implementation HCADGLView
{
    EAGLContext *_glContext;
    GLint _backingWidth;
    GLint _backingHeight;
    GLuint _frameBuffer;
    GLuint _renderBuffer;
    GLuint _depthBuffer;
}

+ (Class)layerClass
{
    return [CAEAGLLayer class];
}

- (instancetype)init
{
    self = [super init];
    if (self) {
        [self setupLayer];
        [self setupContext];
    }
    return self;
}

- (void)setupLayer
{
    CAEAGLLayer *glLayer = (CAEAGLLayer *)self.layer;
    glLayer.opaque = YES;
    glLayer.contentsScale = UIScreen.mainScreen.scale;
}

- (void)setupContext
{
    _glContext = [[EAGLContext alloc] initWithAPI:kEAGLRenderingAPIOpenGLES2];
    [EAGLContext setCurrentContext:_glContext];
}

- (void)createBuffers
{
    glGenFramebuffers(1, &_frameBuffer);
    glBindFramebuffer(GL_FRAMEBUFFER, _frameBuffer);

    glGenRenderbuffers(1, &_renderBuffer);
    glBindRenderbuffer(GL_RENDERBUFFER, _renderBuffer);
    [_glContext renderbufferStorage:GL_RENDERBUFFER fromDrawable:(CAEAGLLayer *)self.layer];
    glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_RENDERBUFFER, _renderBuffer);

    glGetRenderbufferParameteriv(GL_RENDERBUFFER, GL_RENDERBUFFER_WIDTH, &_backingWidth);
    glGetRenderbufferParameteriv(GL_RENDERBUFFER, GL_RENDERBUFFER_HEIGHT, &_backingHeight);

    glGenRenderbuffers(1, &_depthBuffer);
    glBindRenderbuffer(GL_RENDERBUFFER, _depthBuffer);
    glRenderbufferStorage(GL_RENDERBUFFER, GL_DEPTH_COMPONENT16, _backingWidth, _backingHeight);
    glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_RENDERBUFFER, _depthBuffer);
}

- (void)destroyBuffers
{
    if (_frameBuffer != 0) {
        glDeleteFramebuffers(1, &_frameBuffer);
        _frameBuffer = 0;
    }
    if (_renderBuffer != 0) {
        glDeleteRenderbuffers(1, &_renderBuffer);
        _renderBuffer = 0;
    }
    if (_depthBuffer != 0) {
        glDeleteRenderbuffers(1, &_depthBuffer);
        _depthBuffer = 0;
    }
}

- (void)layoutSubviews
{
    [EAGLContext setCurrentContext:_glContext];
    [self destroyBuffers];
    [self createBuffers];

    glViewport(0, 0, _backingWidth, _backingHeight);
    [self.viewerController setupViewerIfNeeded];
    [self drawView];
}

- (void)drawView
{
    if (_frameBuffer == 0 || _renderBuffer == 0) {
        return;
    }

    [EAGLContext setCurrentContext:_glContext];
    glBindFramebuffer(GL_FRAMEBUFFER, _frameBuffer);
    [self.viewerController draw];
    glBindRenderbuffer(GL_RENDERBUFFER, _renderBuffer);
    [_glContext presentRenderbuffer:GL_RENDERBUFFER];
}

@end
