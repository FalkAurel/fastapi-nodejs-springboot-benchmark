package com.benchmark;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
public class AgeController {

    private final UserRepository userRepository;

    public AgeController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/get-age")
    public Map<String, List<DepartmentStats>> getAge() {
        return Map.of("departments", userRepository.getDepartmentStats());
    }
}
