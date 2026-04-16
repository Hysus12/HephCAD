#pragma once

#include <string>
#include <vector>

namespace hephcad {

struct BodyStub {
    std::string identifier;
    std::string name;
    std::string kind;
};

class KernelSessionStub {
public:
    std::vector<BodyStub> makeDemoShape() const;
    std::vector<BodyStub> importStep(const std::string& path) const;
};

} // namespace hephcad
